import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { customers } from "@/db/schema";
import { createBooking } from "@/modules/booking/create";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { setCustomerBlocked } from "@/modules/customers/customers";
import { AppError } from "@/modules/errors";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Client bloqué par l'établissement : plus de réservation en ligne, même avec une autre adresse. */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const at = (time: string) => localToUtc("2026-10-06", time, TZ);

describe.skipIf(!hasTestDatabase)("client bloqué", () => {
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

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  it("réservation en ligne refusée (même e-mail ou même téléphone), possible pour la gérante, et après déblocage", async () => {
    const slug = `bloque-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: "Spa Bloc", slug, planCode: "serenite", managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const soin = await platform((tx) =>
      saveService(tx, id, { name: "Soin", durationMinutes: 30, price: "40" }),
    );
    await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [soin.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));

    const book = (time: string, email: string, source: "online" | "manual" = "online") =>
      withTenant(
        id,
        (tx) =>
          createBooking(
            tx,
            id,
            {
              serviceIds: [soin.id],
              staffId: null,
              start: at(time),
              customer: { firstName: "Nina", email, phone: "06 11 22 33 44" },
            },
            { now: NOW, source },
          ),
        app,
      );

    await book("09:00", "nina@example.com");
    const [nina] = await owner.select().from(customers).where(eq(customers.tenantId, id));
    await withTenant(
      id,
      (tx) => setCustomerBlocked(tx, id, nina.id, { blocked: true, reason: "Absences" }),
      app,
    );
    const [blocked] = await owner.select().from(customers).where(eq(customers.id, nina.id));
    expect(blocked).toMatchObject({ blockedReason: "Absences" });
    expect(blocked.blockedAt).not.toBeNull();

    expect(await errorCode(book("10:00", "nina@example.com"))).toBe("booking_blocked");
    // Autre adresse, même téléphone : toujours refusé.
    expect(await errorCode(book("10:00", "autre-nina@example.com"))).toBe("booking_blocked");
    // La gérante peut noter un rendez-vous.
    expect((await book("11:00", "nina@example.com", "manual")).status).toBe("confirmed");

    await withTenant(id, (tx) => setCustomerBlocked(tx, id, nina.id, { blocked: false }), app);
    expect((await book("12:00", "nina@example.com")).status).toBe("confirmed");
  });
});
