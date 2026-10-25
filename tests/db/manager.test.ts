import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { appointments, authSessions, usageCounters } from "@/db/schema";
import { setPlatformAdmin } from "@/db/admin-role";
import {
  cancelByManager,
  createManualAppointment,
  moveAppointment,
  setAttendance,
} from "@/modules/agenda/actions";
import { dayRange, listAgenda, todaySummary } from "@/modules/agenda/queries";
import { getSlotsForRange, loadBookingContext, onlineStaff } from "@/modules/booking/availability";
import { createBooking } from "@/modules/booking/create";
import { updateBookingSettings } from "@/modules/booking/settings";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { customerDirectory, getCustomer, saveCustomer, searchCustomers } from "@/modules/customers/customers";
import { AppError } from "@/modules/errors";
import {
  createUpdateRequest,
  listAllRequests,
  monthlyRequestCounts,
  setRequestStatus,
} from "@/modules/requests/update-requests";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { createTimeOff } from "@/modules/schedule/time-off";
import { getStatsGoals, updateStatsGoals } from "@/modules/stats/goals";
import { monthDetails, monthStats } from "@/modules/stats/month";
import { replaceStaffSchedules } from "@/modules/team/schedules";
import { deleteStaff, saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changePlan, changeStatus } from "@/modules/tenants/update";
import { resolveManagerRole } from "@/lib/manager/role";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const DAY = "2026-10-06";
const at = (time: string, date = DAY) => localToUtc(date, time, TZ);

/** Modules de l'espace gérante, avec le rôle du tenant (comme dans l'application). */
describe.skipIf(!hasTestDatabase)("espace gérante : modules", () => {
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
  const asManager = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(tenantId, fn, app);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  async function setup(planCode = "serenite") {
    n += 1;
    const slug = `gerante-${n}-${Date.now().toString(36)}`;
    const { tenant, managerId } = await platform((tx) =>
      createTenant(tx, { name: `Institut ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    const surPlace = await platform((tx) =>
      saveService(tx, id, { name: "Sur place", durationMinutes: 30, price: "20", isOnlineBookable: false }),
    );
    const lea = await platform((tx) =>
      saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id, surPlace.id] }),
    );
    const ines =
      planCode === "basic"
        ? null
        : await platform((tx) => saveStaff(tx, id, { name: "Inès", serviceIds: [] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    return { id, managerId, massage, surPlace, lea, ines };
  }

  const onlineBooking = (
    tenantId: string,
    serviceId: string,
    start: Date,
    email = `c${Math.random()}@example.com`,
  ) =>
    asManager(tenantId, (tx) =>
      createBooking(
        tx,
        tenantId,
        {
          serviceIds: [serviceId],
          staffId: null,
          start,
          customer: { firstName: "Camille", email, phone: "0612345678" },
        },
        { now: NOW },
      ),
    );

  describe("accès", () => {
    it("la gérante accède à son établissement, pas aux autres", async () => {
      const a = await setup();
      const b = await setup();
      const session = { user: { id: a.managerId }, session: {} };
      expect(await resolveManagerRole(session, a.id, app)).toBe("owner");
      expect(await resolveManagerRole(session, b.id, app)).toBeNull();
      expect(await resolveManagerRole(session, "pas-un-identifiant", app)).toBeNull();
    });

    it("l'administratrice n'y accède qu'avec une double vérification valide", async () => {
      const s = await setup();
      const admin = await setPlatformAdmin(owner, `admin-voir-${Date.now()}@example.com`, true);
      expect(await resolveManagerRole({ user: { id: admin.id }, session: {} }, s.id, app)).toBeNull();
      await owner.execute(
        `INSERT INTO admin_two_factors (user_id, secret_encrypted, confirmed_at) VALUES ('${admin.id}', 'x', now())` as never,
      );
      expect(
        await resolveManagerRole(
          { user: { id: admin.id }, session: { twoFactorVerifiedAt: null } },
          s.id,
          app,
        ),
      ).toBeNull();
      expect(
        await resolveManagerRole(
          { user: { id: admin.id }, session: { twoFactorVerifiedAt: new Date() } },
          s.id,
          app,
        ),
      ).toBe("admin");
      await owner.delete(authSessions).where(eq(authSessions.userId, admin.id));
    });
  });

  describe("agenda et écran « Aujourd'hui »", () => {
    it("liste les rendez-vous du jour avec cliente, membre et prestations", async () => {
      const s = await setup();
      await onlineBooking(s.id, s.massage.id, at("10:00"));
      await onlineBooking(s.id, s.massage.id, at("14:00"));
      const { start, end } = dayRange(DAY, TZ);
      const list = await asManager(s.id, (tx) =>
        listAgenda(tx, s.id, { from: start, to: end, locale: "fr" }),
      );
      expect(list.map((item) => item.services)).toEqual([["Massage"], ["Massage"]]);
      expect(list[0]).toMatchObject({ customerName: "Camille", staffName: "Léa", status: "confirmed" });
    });

    it("chiffres du jour : rendez-vous, chiffre d'affaires prévu, nouvelles réservations, prochain rendez-vous", async () => {
      const s = await setup();
      const first = await onlineBooking(s.id, s.massage.id, at("10:00"));
      const second = await onlineBooking(s.id, s.massage.id, at("14:00"));
      // Les réservations ont été faites la veille au soir (moins de 24 h avant midi).
      await owner
        .update(appointments)
        .set({ createdAt: at("20:00", "2026-10-05") })
        .where(eq(appointments.tenantId, s.id));
      const midday = at("12:00");
      const summary = await asManager(s.id, (tx) => todaySummary(tx, s.id, TZ, "fr", midday));
      expect(summary).toMatchObject({
        date: DAY,
        count: 2,
        revenueCents: 14000,
        newBookings: 2,
        nextId: second.appointmentId,
      });
      await asManager(s.id, (tx) => setAttendance(tx, s.id, first.appointmentId, "no_show"));
      const after = await asManager(s.id, (tx) => todaySummary(tx, s.id, TZ, "fr", midday));
      expect(after).toMatchObject({ count: 1, revenueCents: 7000 });
    });
  });

  describe("actions sur un rendez-vous", () => {
    it("venue / absente, puis annulation refusée sur un rendez-vous déjà passé", async () => {
      const s = await setup();
      const booking = await onlineBooking(s.id, s.massage.id, at("10:00"));
      expect(
        await asManager(s.id, (tx) => setAttendance(tx, s.id, booking.appointmentId, "attended")),
      ).toEqual({ before: "confirmed", after: "attended" });
      expect(await errorCode(asManager(s.id, (tx) => cancelByManager(tx, s.id, booking.appointmentId)))).toBe(
        "booking_not_modifiable",
      );
    });

    it("annulation par la gérante : le créneau se libère", async () => {
      const s = await setup();
      const booking = await onlineBooking(s.id, s.massage.id, at("10:00"));
      await asManager(s.id, (tx) => cancelByManager(tx, s.id, booking.appointmentId, "Maladie"));
      const [row] = await owner.select().from(appointments).where(eq(appointments.id, booking.appointmentId));
      expect(row).toMatchObject({
        status: "cancelled",
        cancelledBy: "manager",
        cancellationReason: "Maladie",
      });
    });

    it("déplacer : nouvel horaire ; refus si conflit ou si le membre ne fait pas la prestation", async () => {
      const s = await setup();
      const a = await onlineBooking(s.id, s.massage.id, at("10:00"));
      await onlineBooking(s.id, s.massage.id, at("14:00"));
      await asManager(s.id, (tx) =>
        moveAppointment(tx, s.id, a.appointmentId, { start: at("11:30"), staffId: s.lea.id }),
      );
      const [moved] = await owner.select().from(appointments).where(eq(appointments.id, a.appointmentId));
      expect(moved.startsAt.toISOString()).toBe(at("11:30").toISOString());
      expect(moved.endsAt.toISOString()).toBe(at("12:30").toISOString());
      expect(
        await errorCode(
          asManager(s.id, (tx) =>
            moveAppointment(tx, s.id, a.appointmentId, { start: at("14:30"), staffId: s.lea.id }),
          ),
        ),
      ).toBe("slot_unavailable");
      expect(
        await errorCode(
          asManager(s.id, (tx) =>
            moveAppointment(tx, s.id, a.appointmentId, { start: at("16:00"), staffId: s.ines!.id }),
          ),
        ),
      ).toBe("slot_unavailable");
    });
  });

  describe("équipe", () => {
    it("un membre sans rendez-vous est supprimé ; avec des rendez-vous, il est désactivé et on le dit", async () => {
      const s = await setup();
      expect(await asManager(s.id, (tx) => deleteStaff(tx, s.id, s.ines!.id, NOW))).toEqual({
        deleted: true,
        upcoming: 0,
      });
      await onlineBooking(s.id, s.massage.id, at("10:00"));
      expect(await asManager(s.id, (tx) => deleteStaff(tx, s.id, s.lea.id, NOW))).toEqual({
        deleted: false,
        upcoming: 1,
      });
      // Ses rendez-vous restent visibles dans l'agenda (colonne « désactivée »).
      const range = dayRange(DAY, TZ, 1);
      const agenda = await asManager(s.id, (tx) =>
        listAgenda(tx, s.id, { from: range.start, to: range.end, locale: "fr" }),
      );
      expect(agenda.map((item) => item.staffName)).toEqual(["Léa"]);
    });
  });

  describe("limites du pack", () => {
    it("une fiche archivée ne compte plus ; la réactiver est contrôlé", async () => {
      const s = await setup("basic");
      await onlineBooking(s.id, s.massage.id, at("10:00"));
      expect((await asManager(s.id, (tx) => deleteStaff(tx, s.id, s.lea.id, NOW))).deleted).toBe(false);
      // Basic : 1 membre. Léa archivée (elle a un historique), une nouvelle fiche est possible.
      await asManager(s.id, (tx) => saveStaff(tx, s.id, { name: "Nora", serviceIds: [s.massage.id] }));
      expect(
        await errorCode(
          asManager(s.id, (tx) => saveStaff(tx, s.id, { name: "Léa", isActive: true }, s.lea.id)),
        ),
      ).toBe("quota_reached");
    });

    it("après un passage à un pack inférieur, seuls les premiers membres sont proposés en ligne", async () => {
      const s = await setup();
      await platform((tx) => changePlan(tx, s.id, "basic"));
      const context = await asManager(s.id, (tx) => loadBookingContext(tx, s.id));
      expect(context.staff.map((member) => member.name)).toEqual(["Léa", "Inès"]);
      expect(onlineStaff(context).map((member) => member.name)).toEqual(["Léa"]);
    });

    it("les réservations en ligne sont comptées même sans limite", async () => {
      const s = await setup();
      await onlineBooking(s.id, s.massage.id, at("10:00"));
      const [row] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(row.onlineBookings).toBe(1);
    });
  });

  describe("ajout manuel", () => {
    it("toute prestation, nouvelle cliente, hors quota Basic, même hors horaires", async () => {
      const s = await setup("basic");
      const result = await asManager(s.id, (tx) =>
        createManualAppointment(tx, s.id, {
          serviceIds: [s.surPlace.id],
          staffId: s.lea.id,
          start: at("19:00"),
          newCustomer: { firstName: "Zoé", phone: "06 11 22 33 44" },
          internalNote: "Appel du matin",
        }),
      );
      const [row] = await owner.select().from(appointments).where(eq(appointments.id, result.appointmentId));
      expect(row).toMatchObject({
        source: "manual",
        status: "confirmed",
        totalCents: 2000,
        internalNote: "Appel du matin",
      });
      expect(await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id))).toHaveLength(
        0,
      );
    });

    it("refuse un chevauchement avec un autre rendez-vous du membre", async () => {
      const s = await setup();
      await onlineBooking(s.id, s.massage.id, at("10:00"));
      expect(
        await errorCode(
          asManager(s.id, (tx) =>
            createManualAppointment(tx, s.id, {
              serviceIds: [s.massage.id],
              staffId: s.lea.id,
              start: at("10:30"),
              newCustomer: { firstName: "Zoé", phone: "0611223344" },
            }),
          ),
        ),
      ).toBe("slot_unavailable");
    });

    it("exige un téléphone ou un e-mail pour une nouvelle cliente", async () => {
      const s = await setup();
      expect(
        await errorCode(
          asManager(s.id, (tx) =>
            createManualAppointment(tx, s.id, {
              serviceIds: [s.massage.id],
              staffId: s.lea.id,
              start: at("10:00"),
              newCustomer: { firstName: "Zoé" },
            }),
          ),
        ),
      ).toBe("invalid");
    });
  });

  describe("clientes", () => {
    it("recherche par nom ou téléphone, fiche avec historique et statistiques", async () => {
      const s = await setup();
      const a = await onlineBooking(s.id, s.massage.id, at("10:00"), "marie.dupont@example.com");
      await asManager(s.id, (tx) => setAttendance(tx, s.id, a.appointmentId, "attended"));
      const byName = await asManager(s.id, (tx) => searchCustomers(tx, s.id, "cami"));
      expect(byName).toHaveLength(1);
      // La liste affiche la dernière visite (et non « Pas encore venue »).
      expect(new Date(byName[0].lastVisit!).getTime()).toBe(at("10:00").getTime());
      const byPhone = await asManager(s.id, (tx) => searchCustomers(tx, s.id, "06 12 34"));
      expect(byPhone).toHaveLength(1);
      const card = await asManager(s.id, (tx) => getCustomer(tx, s.id, byName[0].id, "fr"));
      expect(card?.stats).toEqual({ visits: 1, noShows: 0, spentCents: 7000 });
      expect(card?.history[0].services).toEqual(["Massage"]);
    });

    it("fichier clientes : visites, dépenses et groupes (nouvelles, à relancer)", async () => {
      const s = await setup();
      const a = await onlineBooking(s.id, s.massage.id, at("10:00"), "marie.dupont@example.com");
      await asManager(s.id, (tx) => setAttendance(tx, s.id, a.appointmentId, "attended"));
      await asManager(s.id, (tx) => saveCustomer(tx, s.id, { firstName: "Zoé", phone: "0611223344" }));

      const today = await asManager(s.id, (tx) => customerDirectory(tx, s.id, { now: new Date() }));
      expect(today.counts).toEqual({ all: 2, visited: 1, loyal: 0, new: 2, inactive: 0 });
      const camille = today.customers.find((row) => row.firstName === "Camille")!;
      expect(camille).toMatchObject({ visits: 1, spentCents: 7000, isNew: true, inactive: false });
      expect(camille.lastVisit?.getTime()).toBe(at("10:00").getTime());
      expect(today.customers.find((row) => row.firstName === "Zoé")).toMatchObject({ visits: 0 });

      // Trois mois plus tard : Camille n'est pas revenue, elle est à relancer.
      const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const inactive = await asManager(s.id, (tx) =>
        customerDirectory(tx, s.id, { now: later, segment: "inactive" }),
      );
      expect(inactive.counts).toMatchObject({ new: 0, inactive: 1 });
      expect(inactive.customers.map((row) => row.firstName)).toEqual(["Camille"]);
      const search = await asManager(s.id, (tx) => customerDirectory(tx, s.id, { now: later, query: "zo" }));
      expect(search.customers.map((row) => row.firstName)).toEqual(["Zoé"]);
    });

    it("notes et coordonnées ; refuse un e-mail déjà utilisé", async () => {
      const s = await setup();
      const created = await asManager(s.id, (tx) =>
        saveCustomer(tx, s.id, { firstName: "Zoé", phone: "0611223344", notes: "Allergie aux huiles" }),
      );
      expect(created).toMatchObject({ phone: "+33611223344", notes: "Allergie aux huiles" });
      await asManager(s.id, (tx) => saveCustomer(tx, s.id, { firstName: "Nina", email: "nina@example.com" }));
      expect(
        await errorCode(
          asManager(s.id, (tx) =>
            saveCustomer(tx, s.id, { firstName: "Zoé", email: "NINA@example.com" }, created.id),
          ),
        ),
      ).toBe("invalid");
    });
  });

  describe("indisponibilités et horaires", () => {
    it("bloquer un créneau, poser un congé, fermer une journée : les créneaux disparaissent", async () => {
      const s = await setup();
      const slots = () =>
        asManager(s.id, async (tx) => {
          const context = await loadBookingContext(tx, s.id);
          return (
            (
              await getSlotsForRange(tx, context, {
                serviceIds: [s.massage.id],
                staffId: null,
                fromDate: DAY,
                days: 1,
                now: NOW,
              })
            ).get(DAY) ?? []
          ).map((slot) => slot.time);
        });
      await asManager(s.id, (tx) =>
        createTimeOff(tx, s.id, { kind: "block", staffId: s.lea.id, date: DAY, from: "14:00", to: "15:00" }),
      );
      expect(await slots()).not.toContain("14:00");
      expect(await slots()).toContain("15:00");
      await asManager(s.id, (tx) =>
        createTimeOff(tx, s.id, { kind: "closure", startDate: DAY, endDate: DAY, reason: "Inventaire" }),
      );
      expect(await slots()).toEqual([]);
    });

    it("signale les rendez-vous déjà pris pendant un congé", async () => {
      const s = await setup();
      await onlineBooking(s.id, s.massage.id, at("10:00"));
      const result = await asManager(s.id, (tx) =>
        createTimeOff(tx, s.id, { kind: "leave", staffId: s.lea.id, startDate: DAY, endDate: "2026-10-08" }),
      );
      expect(result.conflicts).toHaveLength(1);
      expect(
        await errorCode(
          asManager(s.id, (tx) =>
            createTimeOff(tx, s.id, {
              kind: "block",
              staffId: s.lea.id,
              date: DAY,
              from: "15:00",
              to: "14:00",
            }),
          ),
        ),
      ).toBe("hours_invalid");
    });

    it("horaires d'un membre : seule la plage indiquée est proposée", async () => {
      const s = await setup();
      await asManager(s.id, (tx) =>
        replaceStaffSchedules(tx, s.id, s.lea.id, [{ weekday: 2, opensAt: "13:00", closesAt: "16:00" }]),
      );
      const times = await asManager(s.id, async (tx) => {
        const context = await loadBookingContext(tx, s.id);
        return (
          (
            await getSlotsForRange(tx, context, {
              serviceIds: [s.massage.id],
              staffId: s.lea.id,
              fromDate: DAY,
              days: 1,
              now: NOW,
            })
          ).get(DAY) ?? []
        ).map((slot) => slot.time);
      });
      expect(times[0]).toBe("13:00");
      expect(times.at(-1)).toBe("15:00");
    });
  });

  describe("réglages", () => {
    const base = {
      minNoticeHours: "3",
      maxAdvanceDays: "30",
      slotIntervalMinutes: "30",
      maxServicesPerBooking: "2",
      cancellationDeadlineHours: "48",
      depositEnabled: false,
      depositType: "percent" as const,
      depositValue: "30",
      dailySummaryEnabled: true,
      monthlySummaryEnabled: false,
    };

    it("enregistre les règles de réservation", async () => {
      const s = await setup();
      const updated = await asManager(s.id, (tx) => updateBookingSettings(tx, s.id, base as never));
      expect(updated).toMatchObject({
        minNoticeMinutes: 180,
        maxAdvanceDays: 30,
        slotIntervalMinutes: 30,
        maxServicesPerBooking: 2,
        cancellationDeadlineHours: 48,
        monthlySummaryEnabled: false,
      });
    });

    it("acompte : montant fixe en euros ; refusé sur un pack sans paiement en ligne", async () => {
      const s = await setup();
      const updated = await asManager(s.id, (tx) =>
        updateBookingSettings(tx, s.id, {
          ...base,
          depositEnabled: true,
          depositType: "fixed",
          depositValue: "15,50",
        } as never),
      );
      expect(updated).toMatchObject({ depositEnabled: true, depositType: "fixed", depositValue: 1550 });
      const basic = await setup("basic");
      expect(
        await errorCode(
          asManager(basic.id, (tx) =>
            updateBookingSettings(tx, basic.id, { ...base, depositEnabled: true } as never),
          ),
        ),
      ).toBe("feature_unavailable");
      // Intervalle non proposé (7 min) : refusé par la validation.
      await expect(
        asManager(s.id, (tx) =>
          updateBookingSettings(tx, s.id, { ...base, slotIntervalMinutes: "7" } as never),
        ),
      ).rejects.toThrow();
    });
  });

  describe("demandes de mise à jour", () => {
    it("la gérante envoie une demande ; l'administratrice la voit, la traite, et compte celles du mois", async () => {
      const s = await setup();
      const created = await asManager(s.id, (tx) =>
        createUpdateRequest(tx, s.id, s.managerId, {
          subject: "Nouveau logo",
          message: "Merci de changer le logo.",
        }),
      );
      const listed = await platform((tx) => listAllRequests(tx, { tenantId: s.id }));
      expect(listed.map((item) => item.subject)).toEqual(["Nouveau logo"]);
      expect((await platform((tx) => monthlyRequestCounts(tx))).get(s.id)).toBe(1);
      await platform((tx) => setRequestStatus(tx, created.id, "done"));
      expect(await platform((tx) => listAllRequests(tx, { tenantId: s.id }))).toHaveLength(0);
      expect(await platform((tx) => listAllRequests(tx, { tenantId: s.id, status: "done" }))).toHaveLength(1);
    });
  });

  describe("statistiques", () => {
    it("rendez-vous, absences, chiffre d'affaires et prestations du mois", async () => {
      const s = await setup();
      const a = await onlineBooking(s.id, s.massage.id, at("10:00"));
      await onlineBooking(s.id, s.massage.id, at("14:00"));
      await asManager(s.id, (tx) => setAttendance(tx, s.id, a.appointmentId, "no_show"));
      const stats = await asManager(s.id, (tx) => monthStats(tx, s.id, "2026-10", TZ, "fr"));
      expect(stats).toMatchObject({
        appointments: 2,
        online: 2,
        noShows: 1,
        revenueCents: 7000,
        newCustomers: 2,
      });
      expect(stats.topServices).toEqual([["Massage", 2]]);
      // Détail pour les graphiques : jour par jour, équipe, jour de la semaine, heures.
      const details = await asManager(s.id, (tx) => monthDetails(tx, s.id, "2026-10", TZ));
      expect(details.days).toHaveLength(31);
      expect(details.days[5]).toMatchObject({ date: "2026-10-06", online: 2, manual: 0, revenueCents: 7000 });
      expect(details.staff).toHaveLength(1);
      expect(details.staff[0]).toMatchObject({ count: 2, revenueCents: 7000 });
      expect(details.weekdays[1]).toBe(2); // mardi
      expect(details.hours[10] + details.hours[14]).toBe(2);
      expect(details.averageBasketCents).toBe(7000);
      expect(details).toMatchObject({ customers: 2, returningCustomers: 0 });
    });

    it("objectifs du mois : enregistrés, retirés quand le champ est vide, refusés s'ils sont invalides", async () => {
      const s = await setup();
      await asManager(s.id, (tx) =>
        updateStatsGoals(tx, s.id, { revenue: "3 000,50", appointments: "80", newCustomers: "" }),
      );
      expect(await asManager(s.id, (tx) => getStatsGoals(tx, s.id))).toEqual({
        revenueCents: 300050,
        appointments: 80,
        newCustomers: null,
      });
      await asManager(s.id, (tx) =>
        updateStatsGoals(tx, s.id, { revenue: "", appointments: "", newCustomers: "5" }),
      );
      expect(await asManager(s.id, (tx) => getStatsGoals(tx, s.id))).toEqual({
        revenueCents: null,
        appointments: null,
        newCustomers: 5,
      });
      await expect(
        asManager(s.id, (tx) =>
          updateStatsGoals(tx, s.id, { revenue: "abc", appointments: "", newCustomers: "" }),
        ),
      ).rejects.toThrow(AppError);
    });
  });
});
