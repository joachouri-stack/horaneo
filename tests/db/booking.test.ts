import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  appointments,
  customers,
  businessSettings,
  businesses,
  timeOff,
  usageCounters,
} from "@/db/schema";
import { getSlotsForRange, isOnlineQuotaReached, loadBookingContext } from "@/modules/booking/availability";
import { setOnlineBooking } from "@/modules/booking/settings";
import { createBooking, type BookingInput } from "@/modules/booking/create";
import { cancelByCustomer, findByManageToken, rescheduleByCustomer } from "@/modules/booking/manage";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changePlan, changeStatus } from "@/modules/tenants/update";
import { createFakeGateway } from "../setup/fake-gateway";
import { hasTestDatabase, openAppDb, openTestDb, withLegacyBasic, type TestDb } from "../setup/db";

/**
 * Moteur de réservation sur vraie base, avec le rôle restreint du site public.
 * « Maintenant » = lundi 5 octobre 2026, 9 h à Paris ; les rendez-vous sont pris le mardi 6.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const DAY = "2026-10-06";
const at = (time: string, date = DAY) => localToUtc(date, time, TZ);

describe.skipIf(!hasTestDatabase)("moteur de réservation", () => {
  let owner: TestDb;
  let restoreBasic: (() => Promise<void>) | undefined;
  let app: TestDb;
  let n = 0;

  beforeAll(async () => {
    owner = await openTestDb();
    // Ces tests vérifient les quotas avec les règles de l'ancien Basic.
    restoreBasic = await withLegacyBasic(owner);
    app = openAppDb();
  });

  afterAll(async () => {
    await restoreBasic?.();
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  /** Le site public agit avec le rôle du tenant. */
  const asSite = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) => withTenant(tenantId, fn, app);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  /** Établissement ouvert le mardi 9 h-18 h, avec Léa (massage, soin) et Inès (soin seulement). */
  async function setup(planCode = "serenite") {
    n += 1;
    const slug = `resa-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: `Spa ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, bufferMinutes: 15, price: "70" }),
    );
    const soin = await platform((tx) =>
      saveService(tx, id, { name: "Soin", durationMinutes: 30, price: "40" }),
    );
    const offline = await platform((tx) =>
      saveService(tx, id, { name: "Sur place", durationMinutes: 30, price: "10", isOnlineBookable: false }),
    );
    const lea = await platform((tx) =>
      saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id, soin.id, offline.id] }),
    );
    // Le pack Basic n'autorise qu'un membre.
    const ines =
      planCode === "basic"
        ? null
        : await platform((tx) => saveStaff(tx, id, { name: "Inès", serviceIds: [soin.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    return { id, massage, soin, offline, lea, ines };
  }

  const customer = (email = `cliente-${Math.random().toString(36).slice(2, 8)}@example.com`) => ({
    firstName: "Camille",
    lastName: "Martin",
    email,
    phone: "06 12 34 56 78",
  });

  const fake = createFakeGateway();

  function book(
    tenantId: string,
    input: Partial<BookingInput> & Pick<BookingInput, "serviceIds">,
    now = NOW,
  ) {
    return asSite(tenantId, (tx) =>
      createBooking(
        tx,
        tenantId,
        { staffId: null, start: at("10:00"), customer: customer(), ...input },
        { now, gateway: fake.gateway },
      ),
    );
  }

  /** Compte Stripe prêt à encaisser. */
  async function connectStripe(tenantId: string) {
    await owner
      .update(businesses)
      .set({ stripeAccountId: `acct_${tenantId.replaceAll("-", "")}`, stripeChargesEnabled: true })
      .where(eq(businesses.tenantId, tenantId));
  }

  async function slotTimes(tenantId: string, serviceIds: string[], staffId: string | null = null, now = NOW) {
    return asSite(tenantId, async (tx) => {
      const context = await loadBookingContext(tx, tenantId);
      const slots =
        (await getSlotsForRange(tx, context, { serviceIds, staffId, fromDate: DAY, days: 1, now })).get(
          DAY,
        ) ?? [];
      return slots.map((slot) => slot.time);
    });
  }

  describe("disponibilités", () => {
    it("ne propose que les membres qui réalisent toutes les prestations choisies", async () => {
      const s = await setup();
      const both = await asSite(s.id, async (tx) => {
        const context = await loadBookingContext(tx, s.id);
        return (
          await getSlotsForRange(tx, context, {
            serviceIds: [s.massage.id, s.soin.id],
            staffId: null,
            fromDate: DAY,
            days: 1,
            now: NOW,
          })
        ).get(DAY)!;
      });
      expect(both[0].staffIds).toEqual([s.lea.id]);
      expect(both.at(-1)!.time).toBe("16:30"); // 90 minutes avant 18 h
    });

    it("refuse une prestation non réservable en ligne", async () => {
      const s = await setup();
      expect(await errorCode(slotTimes(s.id, [s.offline.id]))).toBe("service_unavailable");
    });

    it("respecte le nombre maximum de prestations par rendez-vous", async () => {
      const s = await setup();
      await owner
        .update(businessSettings)
        .set({ maxServicesPerBooking: 1 })
        .where(eq(businessSettings.tenantId, s.id));
      expect(await errorCode(slotTimes(s.id, [s.massage.id, s.soin.id]))).toBe("too_many_services");
    });

    it("tient compte des congés et des fermetures", async () => {
      const s = await setup();
      await owner.insert(timeOff).values({
        tenantId: s.id,
        staffId: s.lea.id,
        kind: "leave",
        startsAt: at("12:00"),
        endsAt: at("18:00"),
      });
      const times = await slotTimes(s.id, [s.massage.id], s.lea.id);
      expect(times.at(-1)).toBe("11:00");
      await owner.insert(timeOff).values({
        tenantId: s.id,
        staffId: null,
        kind: "closure",
        startsAt: at("00:00"),
        endsAt: at("23:59"),
      });
      expect(await slotTimes(s.id, [s.soin.id])).toEqual([]);
    });
  });

  describe("création", () => {
    it("crée un rendez-vous confirmé, la fiche cliente et les prestations", async () => {
      const s = await setup();
      const result = await book(s.id, { serviceIds: [s.massage.id, s.soin.id], start: at("10:00") });
      expect(result).toMatchObject({
        status: "confirmed",
        staffId: s.lea.id,
        totalCents: 11000,
        depositCents: 0,
      });
      expect(result.endsAt.toISOString()).toBe(at("11:30").toISOString());
      const [row] = await owner.select().from(appointments).where(eq(appointments.id, result.appointmentId));
      expect(row.blockedUntil.toISOString()).toBe(at("11:45").toISOString()); // battement du massage
      expect(row.source).toBe("online");
      expect(row.manageTokenHash).not.toBe(result.manageToken);
      const items = await owner
        .select()
        .from(appointmentItems)
        .where(eq(appointmentItems.appointmentId, row.id));
      expect(items.map((item) => item.serviceName)).toEqual([{ fr: "Massage" }, { fr: "Soin" }]);
      const [client] = await owner.select().from(customers).where(eq(customers.id, row.customerId));
      expect(client).toMatchObject({ firstName: "Camille", phone: "+33612345678" });
    });

    it("« sans préférence » : attribue le membre le moins chargé", async () => {
      const s = await setup();
      await book(s.id, { serviceIds: [s.soin.id], staffId: s.lea.id, start: at("14:00") });
      const result = await book(s.id, { serviceIds: [s.soin.id], start: at("10:00") });
      expect(result.staffId).toBe(s.ines!.id);
    });

    it("retrouve la même fiche cliente pour le même e-mail", async () => {
      const s = await setup();
      await book(s.id, {
        serviceIds: [s.soin.id],
        start: at("10:00"),
        customer: customer("fidele@example.com"),
      });
      await book(s.id, {
        serviceIds: [s.soin.id],
        start: at("15:00"),
        customer: { ...customer("FIDELE@example.com"), phone: "0700000000" },
      });
      const rows = await owner
        .select()
        .from(customers)
        .where(sql`${customers.tenantId} = ${s.id}`);
      expect(rows).toHaveLength(1);
      // En ligne, une fiche existante n'est jamais modifiée (le numéro sert à se connecter).
      expect(rows[0].phone).toBe("+33612345678");
    });

    it("refuse un créneau trop proche, fermé ou mal aligné (recalcul côté serveur)", async () => {
      const s = await setup();
      const now = localToUtc(DAY, "09:00", TZ);
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id], start: at("10:00") }, now))).toBe(
        "slot_unavailable",
      );
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id], start: at("19:00") }))).toBe(
        "slot_unavailable",
      );
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id], start: at("10:07") }))).toBe(
        "slot_unavailable",
      );
    });

    it("refuse un membre qui ne réalise pas la prestation", async () => {
      const s = await setup();
      expect(await errorCode(book(s.id, { serviceIds: [s.massage.id], staffId: s.ines!.id }))).toBe(
        "slot_unavailable",
      );
    });

    it("refuse la réservation sur un site qui n'est pas en ligne", async () => {
      const s = await setup();
      await platform((tx) => changeStatus(tx, s.id, "suspend"));
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id] }))).toBe("booking_closed");
    });

    it("réservation en ligne coupée : refusée sur le site, toujours possible pour la gérante", async () => {
      const s = await setup();
      const updated = await asSite(s.id, (tx) => setOnlineBooking(tx, s.id, false));
      expect(updated.onlineBookingEnabled).toBe(false);
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id] }))).toBe("booking_closed");
      const manual = await asSite(s.id, (tx) =>
        createBooking(
          tx,
          s.id,
          { staffId: null, start: at("10:00"), customer: customer(), serviceIds: [s.soin.id] },
          { now: NOW, gateway: fake.gateway, source: "manual" },
        ),
      );
      expect(manual.status).toBe("confirmed");
      await asSite(s.id, (tx) => setOnlineBooking(tx, s.id, true));
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id], start: at("11:00") }))).toBeUndefined();
    });

    it("pack « site seul » : réservation en ligne fermée, même si l'entreprise l'a laissée ouverte", async () => {
      const s = await setup();
      await platform((tx) => changePlan(tx, s.id, "vitrine"));
      const context = await asSite(s.id, (tx) => loadBookingContext(tx, s.id));
      expect(context?.settings.onlineBookingEnabled).toBe(false);
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id] }))).toBe("booking_closed");
      await platform((tx) => changePlan(tx, s.id, "serenite"));
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id] }))).toBeUndefined();
    });

    it("refuse un téléphone invalide sans rien enregistrer", async () => {
      const s = await setup();
      expect(
        await errorCode(
          book(s.id, { serviceIds: [s.soin.id], customer: { ...customer(), phone: "123456" } }),
        ),
      ).toBe("phone_invalid");
      expect(await owner.select().from(appointments).where(eq(appointments.tenantId, s.id))).toHaveLength(0);
    });
  });

  describe("doublons", () => {
    it("deux clientes qui réservent le même créneau au même instant : une seule réussit", async () => {
      const s = await setup();
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") }),
        ),
      );
      const ok = results.filter((result) => result.status === "fulfilled");
      const refused = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
      expect(ok).toHaveLength(1);
      expect(
        refused.every(
          (result) => result.reason instanceof AppError && result.reason.code === "slot_unavailable",
        ),
      ).toBe(true);
      expect(await owner.select().from(appointments).where(eq(appointments.tenantId, s.id))).toHaveLength(1);
    });

    it("cas critique : deux réservations voient le créneau libre en même temps, la base refuse la seconde", async () => {
      const s = await setup();
      const input = { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") };
      // A réserve mais ne valide sa transaction qu'après 400 ms : B ne voit pas encore ce rendez-vous,
      // passe la vérification, puis la base bloque B jusqu'à la validation de A et refuse le doublon.
      const first = asSite(s.id, async (tx) => {
        const result = await createBooking(tx, s.id, { ...input, customer: customer() }, { now: NOW });
        await new Promise((resolve) => setTimeout(resolve, 400));
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const second = book(s.id, input);
      expect((await first).status).toBe("confirmed");
      expect(await errorCode(second)).toBe("slot_unavailable");
      expect(await owner.select().from(appointments).where(eq(appointments.tenantId, s.id))).toHaveLength(1);
    });

    it("le créneau pris disparaît des disponibilités, battement compris", async () => {
      const s = await setup();
      await book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") });
      const times = await slotTimes(s.id, [s.soin.id], s.lea.id);
      expect(times).not.toContain("10:30");
      expect(times).not.toContain("11:00"); // battement jusqu'à 11 h 15
      expect(times).toContain("11:15");
    });
  });

  describe("pack Basic : 5 réservations en ligne par mois", () => {
    it("bloque la sixième sans consommer le compteur en cas d'échec", async () => {
      const s = await setup("basic");
      const starts = ["09:00", "10:00", "11:00", "12:00", "13:00"];
      for (const start of starts) await book(s.id, { serviceIds: [s.soin.id], start: at(start) });
      expect(
        await asSite(s.id, async (tx) => isOnlineQuotaReached(tx, await loadBookingContext(tx, s.id), NOW)),
      ).toBe(true);
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id], start: at("15:00") }))).toBe(
        "booking_quota_reached",
      );
      const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(counter).toMatchObject({ period: "2026-10", onlineBookings: 5 });
    });

    it("une réservation refusée (créneau pris) ne compte pas", async () => {
      const s = await setup("basic");
      await book(s.id, { serviceIds: [s.soin.id], start: at("10:00") });
      expect(await errorCode(book(s.id, { serviceIds: [s.soin.id], start: at("10:00") }))).toBe(
        "slot_unavailable",
      );
      const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(counter.onlineBookings).toBe(1);
    });

    it("des réservations simultanées ne dépassent jamais 5", async () => {
      const s = await setup("basic");
      const starts = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
      await Promise.allSettled(
        starts.map((start) => book(s.id, { serviceIds: [s.soin.id], start: at(start) })),
      );
      const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(counter.onlineBookings).toBe(5);
      expect(await owner.select().from(appointments).where(eq(appointments.tenantId, s.id))).toHaveLength(5);
    });
  });

  describe("acompte : réservation temporaire de 10 minutes", () => {
    it("bloque le créneau pendant 10 minutes, puis le libère", async () => {
      const s = await setup("serenite");
      await connectStripe(s.id);
      await owner
        .update(businessSettings)
        .set({ depositEnabled: true, depositType: "percent", depositValue: 30 })
        .where(eq(businessSettings.tenantId, s.id));
      const held = await book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") });
      expect(held).toMatchObject({ status: "pending_payment", depositCents: 2100 });
      expect(held.holdExpiresAt!.getTime() - NOW.getTime()).toBe(10 * 60 * 1000);

      // Pendant la réservation temporaire : créneau indisponible.
      expect(
        await errorCode(book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") })),
      ).toBe("slot_unavailable");
      // 11 minutes plus tard, sans paiement : le créneau est libéré et repris.
      const later = new Date(NOW.getTime() + 11 * 60 * 1000);
      expect(await slotTimes(s.id, [s.massage.id], s.lea.id, later)).toContain("10:00");
      const second = await book(
        s.id,
        { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") },
        later,
      );
      expect(second.status).toBe("pending_payment");
      const [expired] = await owner
        .select()
        .from(appointments)
        .where(eq(appointments.id, held.appointmentId));
      expect(expired.status).toBe("expired");
    });

    it("pas d'acompte tant que le compte Stripe ne peut pas encaisser", async () => {
      const s = await setup("serenite");
      await owner
        .update(businessSettings)
        .set({ depositEnabled: true })
        .where(eq(businessSettings.tenantId, s.id));
      expect((await book(s.id, { serviceIds: [s.soin.id] })).status).toBe("confirmed");
    });

    it("pas d'acompte sur un pack sans paiement en ligne", async () => {
      const s = await setup("basic");
      await connectStripe(s.id);
      await owner
        .update(businessSettings)
        .set({ depositEnabled: true })
        .where(eq(businessSettings.tenantId, s.id));
      expect((await book(s.id, { serviceIds: [s.soin.id] })).status).toBe("confirmed");
    });
  });

  describe("gestion par le lien (sans compte)", () => {
    it("retrouve le rendez-vous avec son lien, jamais avec un faux lien", async () => {
      const s = await setup();
      const result = await book(s.id, { serviceIds: [s.massage.id], start: at("10:00") });
      const managed = await asSite(s.id, (tx) => findByManageToken(tx, s.id, result.manageToken));
      expect(managed?.items.map((item) => item.name)).toEqual(["Massage"]);
      expect(managed?.staffName).toBe("Léa");
      expect(await asSite(s.id, (tx) => findByManageToken(tx, s.id, "x".repeat(32)))).toBeNull();
      // Le lien d'un autre établissement ne fonctionne pas ici.
      const other = await setup();
      expect(await asSite(other.id, (tx) => findByManageToken(tx, other.id, result.manageToken))).toBeNull();
    });

    it("annule jusqu'à 24 h avant, refuse ensuite", async () => {
      const s = await setup();
      const early = await book(s.id, { serviceIds: [s.soin.id], start: at("10:00") });
      await asSite(s.id, (tx) => cancelByCustomer(tx, s.id, early.manageToken, NOW));
      const [row] = await owner.select().from(appointments).where(eq(appointments.id, early.appointmentId));
      expect(row).toMatchObject({ status: "cancelled", cancelledBy: "customer" });
      expect(await errorCode(asSite(s.id, (tx) => cancelByCustomer(tx, s.id, early.manageToken, NOW)))).toBe(
        "booking_not_modifiable",
      );

      const late = await book(s.id, { serviceIds: [s.soin.id], start: at("16:00") });
      const tooLate = localToUtc(DAY, "08:00", TZ);
      expect(
        await errorCode(asSite(s.id, (tx) => cancelByCustomer(tx, s.id, late.manageToken, tooLate))),
      ).toBe("cancellation_deadline_passed");
    });

    it("le créneau annulé redevient disponible", async () => {
      const s = await setup();
      const result = await book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") });
      await asSite(s.id, (tx) => cancelByCustomer(tx, s.id, result.manageToken, NOW));
      expect(await slotTimes(s.id, [s.massage.id], s.lea.id)).toContain("10:00");
    });

    it("déplace le rendez-vous : nouveau créneau, nouveau lien, acompte reporté, quota inchangé", async () => {
      const s = await setup("basic");
      const first = await book(s.id, { serviceIds: [s.massage.id], start: at("10:00") });
      await owner
        .update(appointments)
        .set({ depositCents: 2100 })
        .where(eq(appointments.id, first.appointmentId));
      // Décalage d'une demi-heure : chevauche l'ancien créneau, qui compte comme libre.
      const moved = await asSite(s.id, (tx) =>
        rescheduleByCustomer(tx, s.id, first.manageToken, { start: at("10:30"), staffId: null }, NOW),
      );
      const [oldRow] = await owner
        .select()
        .from(appointments)
        .where(eq(appointments.id, first.appointmentId));
      const [newRow] = await owner
        .select()
        .from(appointments)
        .where(eq(appointments.id, moved.appointmentId));
      expect(oldRow).toMatchObject({ status: "cancelled", cancellationReason: "rescheduled" });
      expect(newRow).toMatchObject({
        status: "confirmed",
        depositCents: 2100,
        rescheduledFromId: first.appointmentId,
        staffId: s.lea.id,
      });
      expect(newRow.blockedUntil.toISOString()).toBe(at("11:45").toISOString());
      expect(moved.manageToken).not.toBe(first.manageToken);
      expect(
        await owner.select().from(appointmentItems).where(eq(appointmentItems.appointmentId, newRow.id)),
      ).toHaveLength(1);
      const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(counter.onlineBookings).toBe(1);
      // L'ancien lien ne permet plus rien.
      expect(await errorCode(asSite(s.id, (tx) => cancelByCustomer(tx, s.id, first.manageToken, NOW)))).toBe(
        "booking_not_modifiable",
      );
    });

    it("refuse un report vers un créneau indisponible", async () => {
      const s = await setup();
      const a = await book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("10:00") });
      await book(s.id, { serviceIds: [s.massage.id], staffId: s.lea.id, start: at("14:00") });
      expect(
        await errorCode(
          asSite(s.id, (tx) =>
            rescheduleByCustomer(tx, s.id, a.manageToken, { start: at("14:00"), staffId: s.lea.id }, NOW),
          ),
        ),
      ).toBe("slot_unavailable");
      const [row] = await owner.select().from(appointments).where(eq(appointments.id, a.appointmentId));
      expect(row.status).toBe("confirmed"); // rien n'a changé
    });
  });
});
