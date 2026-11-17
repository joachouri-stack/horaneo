import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import * as s from "@/db/schema";
import { getSlotsForRange, loadBookingContext } from "@/modules/booking/availability";
import { localToUtc } from "@/modules/booking/time";
import { expireAllHolds } from "@/modules/messages/schedule";
import { createTenantWithData } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Corrections de l'audit : créneau d'un rendez-vous « venue », réservations temporaires expirées. */
describe.skipIf(!hasTestDatabase)("corrections de l'audit", () => {
  let owner: TestDb;
  let app: TestDb;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  // Lundi 4 janvier 2027 (l'établissement de la fixture est ouvert le lundi, 9 h – 18 h).
  const DAY = "2027-01-04";
  const TZ = "Europe/Paris";

  it("un rendez-vous marqué « venue » garde son créneau occupé", async () => {
    const { tenant, business, service, staff, customer } = await createTenantWithData(owner, "venue-occupe");
    const start = localToUtc(DAY, "10:00", TZ);
    await owner.insert(s.appointments).values({
      tenantId: tenant.id,
      businessId: business.id,
      customerId: customer.id,
      staffId: staff.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      blockedUntil: new Date(start.getTime() + 3_600_000),
      status: "attended",
      source: "manual",
      totalCents: 6000,
    });
    const times = await withTenant(
      tenant.id,
      async (tx) => {
        const context = await loadBookingContext(tx, tenant.id);
        const days = await getSlotsForRange(tx, context, {
          serviceIds: [service.id],
          staffId: null,
          fromDate: DAY,
          days: 1,
          now: new Date("2027-01-01T08:00:00Z"),
        });
        return (days.get(DAY) ?? []).map((slot) => slot.time);
      },
      app,
    );
    expect(times).toContain("09:00");
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:00");
  });

  it("réservation temporaire expirée par la tâche planifiée : le code promo est rendu", async () => {
    const { tenant, business, staff, customer } = await createTenantWithData(owner, "attente-expiree");
    const [code] = await owner
      .insert(s.promoCodes)
      .values({
        tenantId: tenant.id,
        businessId: business.id,
        code: "UNEFOIS",
        discountType: "percent",
        discountValue: 10,
        maxUses: 1,
        usedCount: 1,
      })
      .returning();
    const start = localToUtc(DAY, "14:00", TZ);
    await owner.insert(s.appointments).values({
      tenantId: tenant.id,
      businessId: business.id,
      customerId: customer.id,
      staffId: staff.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 3_600_000),
      blockedUntil: new Date(start.getTime() + 3_600_000),
      status: "pending_payment",
      source: "manual",
      totalCents: 5400,
      promoCodeId: code.id,
      holdExpiresAt: new Date("2027-01-01T08:00:00Z"),
    });
    const expired = await withPlatform((tx) => expireAllHolds(tx, new Date("2027-01-01T08:20:00Z")), app);
    expect(expired).toBeGreaterThanOrEqual(1);
    const [after] = await owner.select().from(s.promoCodes).where(eq(s.promoCodes.id, code.id));
    expect(after.usedCount).toBe(0);
  });
});
