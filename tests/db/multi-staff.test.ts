import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { appointments, messageLog } from "@/db/schema";
import { getPlanSlotsForRange, loadBookingContext } from "@/modules/booking/availability";
import { createBooking, type BookingInput } from "@/modules/booking/create";
import { cancelByCustomer } from "@/modules/booking/manage";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Plusieurs prestations à la suite avec des collaboratrices différentes : un rendez-vous
 * dans l'agenda de chacune, reliés en une seule réservation. « Maintenant » = lundi 5
 * octobre 2026 ; rendez-vous le mardi 6 (ouvert 9 h – 18 h).
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const DAY = "2026-10-06";
const at = (time: string) => localToUtc(DAY, time, TZ);

describe.skipIf(!hasTestDatabase)("réservation avec plusieurs collaboratrices", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  const asSite = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) => withTenant(tenantId, fn, app);

  /** Léa fait le massage (1 h) et le soin ; Inès, seulement le soin (30 min). */
  async function setup() {
    n += 1;
    const slug = `multi-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: `Spa ${n}`, slug, planCode: "serenite", managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    const soin = await platform((tx) =>
      saveService(tx, id, { name: "Soin", durationMinutes: 30, price: "40" }),
    );
    const lea = await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id, soin.id] }));
    const ines = await platform((tx) => saveStaff(tx, id, { name: "Inès", serviceIds: [soin.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    return { id, massage, soin, lea, ines };
  }

  const book = (tenantId: string, input: Partial<BookingInput> & Pick<BookingInput, "serviceIds">) =>
    asSite(tenantId, (tx) =>
      createBooking(
        tx,
        tenantId,
        {
          staffId: null,
          start: at("10:00"),
          customer: {
            firstName: "Camille",
            email: `camille-${Math.random().toString(36).slice(2, 8)}@example.com`,
            phone: "06 12 34 56 78",
          },
          ...input,
        },
        { now: NOW },
      ),
    );

  const rowsOf = (tenantId: string) =>
    owner
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantId))
      .orderBy(appointments.startsAt);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  it("deux collaboratrices choisies : un rendez-vous dans chaque agenda, à la suite, une seule confirmation", async () => {
    const s = await setup();
    const result = await book(s.id, {
      serviceIds: [s.massage.id, s.soin.id],
      staffPlan: [s.lea.id, s.ines.id],
    });
    expect(result.segments).toEqual([
      { staffId: s.lea.id, startsAt: at("10:00"), endsAt: at("11:00") },
      { staffId: s.ines.id, startsAt: at("11:00"), endsAt: at("11:30") },
    ]);
    const [lead, second] = await rowsOf(s.id);
    expect(lead).toMatchObject({
      staffId: s.lea.id,
      groupId: lead.id,
      totalCents: 11000,
      status: "confirmed",
    });
    expect(second).toMatchObject({ staffId: s.ines.id, groupId: lead.id, totalCents: 0, depositCents: 0 });
    const messages = await owner
      .select({ template: messageLog.templateKey, channel: messageLog.channel })
      .from(messageLog)
      .where(inArray(messageLog.appointmentId, [lead.id, second.id]));
    expect(messages.filter((row) => row.template === "customer.confirmation")).toHaveLength(1);
    // Alerte à la gérante : un seul e-mail (plus sa notification sur le téléphone).
    expect(
      messages.filter((row) => row.template === "manager.new_booking" && row.channel === "email"),
    ).toHaveLength(1);

    // Inès est prise à 11 h : la même suite n'est plus proposée à 10 h.
    expect(
      await errorCode(
        book(s.id, { serviceIds: [s.massage.id, s.soin.id], staffPlan: [s.lea.id, s.ines.id] }),
      ),
    ).toBe("slot_unavailable");
  });

  it("sans préférence : une seule collaboratrice pour tout si elle est libre", async () => {
    const s = await setup();
    const result = await book(s.id, { serviceIds: [s.massage.id, s.soin.id], staffPlan: [null, null] });
    expect(result.segments).toHaveLength(1);
    const rows = await rowsOf(s.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ staffId: s.lea.id, groupId: null, endsAt: at("11:30") });
  });

  it("créneaux de la suite : Léa prise après le massage, le soin passe à Inès", async () => {
    const s = await setup();
    // Léa a déjà un soin de 11 h à 11 h 30.
    await book(s.id, { serviceIds: [s.soin.id], staffId: s.lea.id, start: at("11:00") });
    const slots = await asSite(s.id, async (tx) => {
      const context = await loadBookingContext(tx, s.id);
      return (
        await getPlanSlotsForRange(tx, context, {
          serviceIds: [s.massage.id, s.soin.id],
          staffPlan: [null, null],
          fromDate: DAY,
          days: 1,
          now: NOW,
        })
      ).get(DAY)!;
    });
    const ten = slots.find((slot) => slot.time === "10:00")!;
    expect(ten.candidates).toEqual([[s.lea.id], [s.ines.id]]);
    const result = await book(s.id, { serviceIds: [s.massage.id, s.soin.id], staffPlan: [null, null] });
    expect(result.segments.map((segment) => segment.staffId)).toEqual([s.lea.id, s.ines.id]);
  });

  it("annulation par la cliente : toute la réservation est annulée", async () => {
    const s = await setup();
    const result = await book(s.id, {
      serviceIds: [s.massage.id, s.soin.id],
      staffPlan: [s.lea.id, s.ines.id],
    });
    await asSite(s.id, (tx) => cancelByCustomer(tx, s.id, result.manageToken, NOW));
    const rows = await owner
      .select({ status: appointments.status })
      .from(appointments)
      .where(and(eq(appointments.tenantId, s.id)));
    expect(rows.map((row) => row.status)).toEqual(["cancelled", "cancelled"]);
  });
});
