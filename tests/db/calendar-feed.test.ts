import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businesses } from "@/db/schema";
import { cancelByManager } from "@/modules/agenda/actions";
import {
  calendarFeedAppointments,
  calendarFeedState,
  disableCalendarFeed,
  renewCalendarFeed,
} from "@/modules/agenda/calendar-feed";
import { createBooking } from "@/modules/booking/create";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeGateway } from "../setup/fake-gateway";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Agenda sur le téléphone : lien versionné, rendez-vous publiés, annulés retirés. */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);

describe.skipIf(!hasTestDatabase)("agenda sur le téléphone", () => {
  let owner: TestDb;
  let app: TestDb;
  const gateway = createFakeGateway();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });
  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function setup() {
    const slug = `cal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: "Belle Époque",
        slug,
        planCode: "serenite",
        managerEmail: `${slug}@example.com`,
      }),
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
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [service.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    const [business] = await owner.select().from(businesses).where(eq(businesses.tenantId, id));
    const asBusiness = <T>(fn: (tx: Transaction) => Promise<T>) => withTenant(id, fn, app, business.id);
    const book = (time: string, firstName: string) =>
      asBusiness((tx) =>
        createBooking(
          tx,
          id,
          {
            serviceIds: [service.id],
            staffId: null,
            start: localToUtc("2026-10-06", time, TZ),
            customer: {
              firstName,
              email: `${firstName.toLowerCase()}-${slug}@example.com`,
              phone: "06 12 34 56 78",
            },
            locale: "fr",
          },
          { now: NOW, gateway: gateway.gateway },
        ),
      );
    return { id, asBusiness, book };
  }

  it("désactivé au départ ; le lien publie les rendez-vous, sans les annulés", async () => {
    const s = await setup();
    expect((await s.asBusiness((tx) => calendarFeedState(tx, s.id))).version).toBe(0);
    // Pas de lien actif : rien n'est publié, même pour une version inventée.
    expect(
      await s.asBusiness((tx) => calendarFeedAppointments(tx, s.id, { version: 1, locale: "fr", now: NOW })),
    ).toBeNull();

    await s.book("10:00", "Camille");
    const cancelled = await s.book("14:00", "Ines");
    await s.asBusiness((tx) => cancelByManager(tx, s.id, cancelled.appointmentId));
    const { version } = await s.asBusiness((tx) => renewCalendarFeed(tx, s.id));
    expect(version).toBe(1);
    const events = await s.asBusiness((tx) =>
      calendarFeedAppointments(tx, s.id, { version, locale: "fr", now: NOW }),
    );
    expect(events?.map((e) => [e.customerName, e.services])).toEqual([["Camille", ["Massage"]]]);
  });

  it("un nouveau lien rend l'ancien inutilisable ; arrêter le partage coupe tout", async () => {
    const s = await setup();
    await s.book("10:00", "Camille");
    const first = await s.asBusiness((tx) => renewCalendarFeed(tx, s.id));
    const second = await s.asBusiness((tx) => renewCalendarFeed(tx, s.id));
    expect(second.version).toBe(first.version + 1);
    const read = (version: number) =>
      s.asBusiness((tx) => calendarFeedAppointments(tx, s.id, { version, locale: "fr", now: NOW }));
    expect(await read(first.version)).toBeNull();
    expect(await read(second.version)).toHaveLength(1);
    await s.asBusiness((tx) => disableCalendarFeed(tx, s.id));
    expect(await read(second.version)).toBeNull();
  });
});
