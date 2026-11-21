import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { appointments, customers, messageLog } from "@/db/schema";
import { createBooking } from "@/modules/booking/create";
import { loadBookingContext } from "@/modules/booking/availability";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { dispatchMessages } from "@/modules/messages/dispatch";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { setPlatformSetting } from "@/modules/settings";
import { cleanDemoBookings } from "@/modules/site/demo";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeSenders } from "../setup/fake-senders";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Site de démonstration : réservations fictives (ni paiement, ni message), effacées au bout d'un jour. */
describe.skipIf(!hasTestDatabase)("site de démonstration", () => {
  let app: TestDb;
  let owner: TestDb;
  const TZ = "Europe/Paris";
  const NOW = localToUtc("2026-10-05", "09:00", TZ);
  beforeAll(async () => {
    app = openAppDb();
    owner = await openTestDb();
  });
  afterAll(async () => {
    await withPlatform((tx) => setPlatformSetting(tx, "demo_tenant_id", ""), app);
    await app?.$client.end();
    await owner?.$client.end();
  });
  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  const asTenant = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(tenantId, fn, app);

  it("pas de paiement ni de message, puis réservation et cliente effacées le lendemain", async () => {
    const slug = `demo-${Date.now()}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: "Institut démo", slug, planCode: "pro", managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(
        tx,
        id,
        [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opensAt: "09:00", closesAt: "18:00" })),
      ),
    );
    const service = await platform((tx) =>
      saveService(tx, id, { name: "Soin", durationMinutes: 60, price: "50" }),
    );
    await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [service.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    await platform((tx) => setPlatformSetting(tx, "demo_tenant_id", id));

    const context = await asTenant(id, (tx) => loadBookingContext(tx, id));
    expect(context.features.onlinePayment).toBe(false);

    const booked = await asTenant(id, (tx) =>
      createBooking(
        tx,
        id,
        {
          serviceIds: [service.id],
          staffId: null,
          start: localToUtc("2026-10-06", "10:00", TZ),
          customer: { firstName: "Visiteuse", email: `${slug}-visite@example.com`, phone: "06 12 34 56 78" },
          locale: "fr",
        },
        { now: NOW },
      ),
    );
    // Aucun e-mail ni SMS : les messages de la réservation sont écartés.
    const rows = await owner.select().from(messageLog).where(eq(messageLog.tenantId, id));
    const fake = createFakeSenders();
    await dispatchMessages(platform, fake.senders, {
      productName: "Sirine",
      appUrl: "http://localhost:3000",
      now: NOW,
      ids: rows.map((row) => row.id),
    });
    expect(fake.emails).toHaveLength(0);
    expect(fake.sms).toHaveLength(0);

    // Encore là le jour même, effacée le lendemain avec la cliente.
    await owner.update(appointments).set({ createdAt: NOW }).where(eq(appointments.id, booked.appointmentId));
    expect((await platform((tx) => cleanDemoBookings(tx, NOW))).appointments).toBe(0);
    const later = new Date(NOW.getTime() + 25 * 60 * 60_000);
    expect(await platform((tx) => cleanDemoBookings(tx, later))).toEqual({ appointments: 1, customers: 1 });
    expect(await owner.select().from(customers).where(eq(customers.tenantId, id))).toHaveLength(0);
  });
});
