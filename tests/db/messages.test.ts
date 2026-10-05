import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  assets,
  businesses,
  messageLog,
  plans,
  businessSettings,
  usageCounters,
} from "@/db/schema";
import { cancelByManager, createManualAppointment, moveAppointment } from "@/modules/agenda/actions";
import { createBooking, manageTokenFor, type BookingInput } from "@/modules/booking/create";
import { cancelByCustomer, findByManageToken, rescheduleByCustomer } from "@/modules/booking/manage";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { purgeReplacedAssets } from "@/modules/media/purge";
import { dispatchMessages } from "@/modules/messages/dispatch";
import { queueEmailReminders, queueSmsReminders, queueSummaries } from "@/modules/messages/schedule";
import { smsSenderName } from "@/modules/messages/senders";
import { syncDeposit } from "@/modules/payments/deposits";
import { startOnboarding, refreshAccount } from "@/modules/payments/connect";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeGateway } from "../setup/fake-gateway";
import { createFakeSenders } from "../setup/fake-senders";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Messages automatiques sur vraie base : déclenchement, contenu, langue, rappels
 * programmés, quota de SMS, réessais. « Maintenant » = lundi 5 octobre 2026, 9 h à Paris.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const DAY = "2026-10-06";
const at = (time: string, date = DAY) => localToUtc(date, time, TZ);

describe.skipIf(!hasTestDatabase)("messages automatiques", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const fake = createFakeSenders();
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
  const asTenant = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(tenantId, fn, app);

  async function setup(planCode = "serenite") {
    n += 1;
    const slug = `msg-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: `Belle Époque ${n}`,
        slug,
        planCode,
        managerEmail: `${slug}@example.com`,
        phone: "04 72 00 00 00",
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
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    const lea = await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    return { id, slug, massage, lea, managerEmail: `${slug}@example.com` };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  async function book(s: Setup, input: Partial<BookingInput> = {}, now = NOW) {
    const result = await asTenant(s.id, (tx) =>
      createBooking(
        tx,
        s.id,
        {
          serviceIds: [s.massage.id],
          staffId: null,
          start: at("10:00"),
          customer: { firstName: "Camille", email: `camille-${n}@example.com`, phone: "06 12 34 56 78" },
          locale: "fr",
          ...input,
        },
        { now, gateway: gateway.gateway },
      ),
    );
    // Date de prise du rendez-vous = « maintenant » du test (et non l'horloge réelle).
    await owner.update(appointments).set({ createdAt: now }).where(eq(appointments.id, result.appointmentId));
    return result;
  }

  /** Envoie les messages en attente de cet établissement seulement. */
  async function dispatch(tenantId: string, now = NOW) {
    const rows = await owner
      .select({ id: messageLog.id })
      .from(messageLog)
      .where(and(eq(messageLog.tenantId, tenantId), eq(messageLog.status, "queued")));
    return dispatchMessages(platform, fake.senders, {
      productName: "Horaneo",
      appUrl: "http://localhost:3000",
      now,
      ids: rows.map((row) => row.id),
    });
  }

  async function logOf(tenantId: string) {
    return owner.select().from(messageLog).where(eq(messageLog.tenantId, tenantId));
  }

  /** Intl sépare les milliers et la devise par des espaces insécables : ramenés à des espaces simples. */
  const plain = (text: string) => text.replace(/[\u202f\u00a0]/g, " ");
  const emailsTo = (address: string) =>
    fake.emails
      .filter((email) => email.to.includes(address))
      .map((email) => ({ ...email, text: plain(email.text), subject: plain(email.subject) }));

  describe("à la réservation", () => {
    it("confirmation à la cliente au nom de l'établissement, avec un lien de gestion qui fonctionne", async () => {
      const s = await setup();
      const result = await book(s);
      expect(await dispatch(s.id)).toMatchObject({ sent: 2 });
      const [confirmation] = emailsTo(`camille-${n}@example.com`);
      expect(confirmation).toMatchObject({
        fromName: `Belle Époque ${n}`,
        replyTo: s.managerEmail,
        subject: "Votre rendez-vous du mardi 6 octobre est confirmé",
      });
      expect(confirmation.text).toContain("Massage");
      expect(confirmation.text).toContain("70,00 €");
      expect(confirmation.text).toContain("jusqu'au lundi 5 octobre à 10:00");
      const token = /\/rendez-vous\/([A-Za-z0-9_-]+)/.exec(confirmation.text)?.[1];
      expect(token).toBe(result.manageToken);
      expect(confirmation.text).toContain(`http://${s.slug}.localhost:3000/rendez-vous/${token}`);
      expect((await asTenant(s.id, (tx) => findByManageToken(tx, s.id, token!)))?.appointment.id).toBe(
        result.appointmentId,
      );
      // Alerte à la gérante, au nom du SaaS.
      const [alert] = emailsTo(s.managerEmail);
      expect(alert.fromName).toBe("Horaneo");
      expect(alert.subject).toBe("Nouvelle réservation : Camille, mardi 6 octobre à 10:00");
      expect(alert.text).toContain(`/fr/espace/${s.id}/rendez-vous/${result.appointmentId}`);
      // Rien n'est envoyé deux fois.
      expect(await dispatch(s.id)).toMatchObject({ sent: 0 });
      const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(counter.emailsSent).toBe(2);
    });

    it("le lien de gestion est le même dans chaque message, et différent pour chaque rendez-vous", async () => {
      expect(manageTokenFor("a")).toBe(manageTokenFor("a"));
      expect(manageTokenFor("a")).not.toBe(manageTokenFor("b"));
      expect(manageTokenFor("a")).toMatch(/^[A-Za-z0-9_-]{32}$/);
    });

    it("avec acompte : confirmation seulement une fois le paiement reçu", async () => {
      const s = await setup();
      const [business] = await owner.select().from(businesses).where(eq(businesses.tenantId, s.id));
      const { accountId } = await platform((tx) =>
        startOnboarding(tx, s.id, business.id, gateway.gateway, {
          returnUrl: "https://x",
          refreshUrl: "https://x",
        }),
      );
      gateway.activate(accountId);
      await platform((tx) => refreshAccount(tx, s.id, business.id, gateway.gateway));
      await owner
        .update(businessSettings)
        .set({ depositEnabled: true })
        .where(eq(businessSettings.tenantId, s.id));
      const result = await book(s);
      expect(result.status).toBe("pending_payment");
      expect(await logOf(s.id)).toHaveLength(0);
      const intent = [...gateway.intents.values()].find(
        (item) => item.metadata.appointment_id === result.appointmentId,
      )!;
      gateway.pay(intent.id);
      await asTenant(s.id, (tx) => syncDeposit(tx, s.id, result.appointmentId, gateway.gateway));
      await dispatch(s.id);
      const [confirmation] = emailsTo(`camille-${n}@example.com`);
      expect(confirmation.text).toContain("Acompte payé : 21,00 €");
    });

    it("pack Basic : la gérante est prévenue à la 4e et à la 5e réservation du mois", async () => {
      const s = await setup("basic");
      for (const time of ["09:00", "10:00", "11:00", "12:00", "13:00"]) {
        await book(s, { start: at(time) });
      }
      await dispatch(s.id);
      const subjects = emailsTo(s.managerEmail).map((email) => email.subject);
      expect(subjects.filter((subject) => subject.startsWith("Nouvelle réservation"))).toHaveLength(5);
      expect(subjects).toContain("Plus qu'une réservation en ligne ce mois-ci");
      expect(subjects).toContain("Limite de réservations en ligne atteinte");
    });

    it("ajout manuel : confirmation à la cliente, pas d'alerte à la gérante ; sans e-mail, rien n'est envoyé", async () => {
      const s = await setup();
      await asTenant(s.id, (tx) =>
        createManualAppointment(tx, s.id, {
          serviceIds: [s.massage.id],
          staffId: s.lea.id,
          start: at("15:00"),
          newCustomer: { firstName: "Zoé", phone: "06 98 76 54 32", email: `zoe-${n}@example.com` },
        }),
      );
      await asTenant(s.id, (tx) =>
        createManualAppointment(tx, s.id, {
          serviceIds: [s.massage.id],
          staffId: s.lea.id,
          start: at("16:00"),
          newCustomer: { firstName: "Sans", phone: "06 11 11 11 11" },
        }),
      );
      expect(await dispatch(s.id)).toMatchObject({ sent: 1, skipped: 1 });
      expect(emailsTo(`zoe-${n}@example.com`)).toHaveLength(1);
      expect(emailsTo(s.managerEmail)).toHaveLength(0);
      expect((await logOf(s.id)).find((row) => row.status === "skipped")?.error).toBe("no_email");
    });
  });

  describe("annulation et report", () => {
    it("annulation par la cliente : confirmation avec remboursement, et alerte à la gérante", async () => {
      const s = await setup();
      const result = await book(s);
      await dispatch(s.id);
      fake.clear();
      await asTenant(s.id, (tx) => cancelByCustomer(tx, s.id, result.manageToken, NOW, gateway.gateway));
      await dispatch(s.id);
      const [mail] = emailsTo(`camille-${n}@example.com`);
      expect(mail.subject).toBe("Votre rendez-vous du mardi 6 octobre est annulé");
      expect(mail.text).toContain("est bien annulé");
      expect(emailsTo(s.managerEmail)[0].subject).toBe("Annulation : Camille, mardi 6 octobre à 10:00");
    });

    it("annulation par l'établissement et déplacement : la cliente est prévenue", async () => {
      const s = await setup();
      const first = await book(s, { start: at("10:00") });
      const second = await book(s, { start: at("14:00") });
      await dispatch(s.id);
      fake.clear();
      await asTenant(s.id, (tx) => cancelByManager(tx, s.id, first.appointmentId));
      await asTenant(s.id, (tx) =>
        moveAppointment(tx, s.id, second.appointmentId, { start: at("16:00"), staffId: s.lea.id }),
      );
      await dispatch(s.id);
      const subjects = fake.emails.map((email) => email.subject);
      expect(subjects).toContain("Votre rendez-vous du mardi 6 octobre est annulé");
      expect(subjects).toContain("Nouvel horaire pour votre rendez-vous du mardi 6 octobre");
      const moved = fake.emails.find((email) => email.subject.startsWith("Nouvel horaire"))!;
      expect(moved.text).toContain("ancien créneau : mardi 6 octobre à 14:00");
      expect(moved.text).toContain("mardi 6 octobre à 16:00");
      expect(fake.emails.find((email) => email.text.includes("a dû annuler"))).toBeDefined();
    });

    it("report par la cliente : nouveau lien dans l'e-mail, gérante prévenue", async () => {
      const s = await setup();
      const result = await book(s);
      await dispatch(s.id);
      fake.clear();
      const moved = await asTenant(s.id, (tx) =>
        rescheduleByCustomer(tx, s.id, result.manageToken, { start: at("15:00"), staffId: null }, NOW),
      );
      await dispatch(s.id);
      const [mail] = emailsTo(`camille-${n}@example.com`);
      expect(mail.subject).toBe("Votre rendez-vous est déplacé au mardi 6 octobre");
      expect(mail.text).toContain(moved.manageToken);
      expect(emailsTo(s.managerEmail)[0].subject).toContain("Rendez-vous déplacé");
    });
  });

  describe("rappels programmés", () => {
    it("e-mail 24 h avant, une seule fois ; pas pour un rendez-vous pris la veille ou annulé", async () => {
      const s = await setup();
      const far = await book(s, { start: at("10:00", "2026-10-08") });
      const late = await book(s, { start: at("11:00", "2026-10-08") }, localToUtc("2026-10-07", "20:00", TZ));
      const cancelled = await book(s, { start: at("12:00", "2026-10-08") });
      await dispatch(s.id);
      fake.clear();
      const dayBefore = localToUtc("2026-10-07", "12:05", TZ);
      await platform((tx) => queueEmailReminders(tx, dayBefore));
      await platform((tx) => queueEmailReminders(tx, dayBefore));
      await owner
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, cancelled.appointmentId));
      const result = await dispatch(s.id, dayBefore);
      const reminders = fake.emails.filter((email) => email.subject.startsWith("Rappel"));
      expect(reminders).toHaveLength(1);
      expect(reminders[0].subject).toBe("Rappel : votre rendez-vous du jeudi 8 octobre à 10:00");
      expect(reminders[0].text).toContain(manageTokenFor(far.appointmentId));
      expect(result.skipped).toBe(1);
      const rows = await logOf(s.id);
      expect(rows.filter((row) => row.templateKey === "customer.reminder_email")).toHaveLength(2);
      expect(
        rows.find(
          (row) => row.appointmentId === late.appointmentId && row.templateKey === "customer.reminder_email",
        ),
      ).toBeUndefined();
    });

    it("SMS la veille à 18 h, au nom de l'établissement, une seule fois", async () => {
      const s = await setup();
      await book(s, { start: at("10:00") });
      // Pris 23 h avant : pas de rappel SMS (décision n° 6).
      const recent = await book(
        s,
        {
          start: at("11:30"),
          customer: { firstName: "Nina", email: `nina-${n}@example.com`, phone: "06 55 44 33 22" },
        },
        localToUtc("2026-10-05", "12:30", TZ),
      );
      await dispatch(s.id);
      const beforeTime = localToUtc("2026-10-05", "17:55", TZ);
      const atTime = localToUtc("2026-10-05", "18:05", TZ);
      const tooLate = localToUtc("2026-10-05", "22:00", TZ);
      await platform((tx) => queueSmsReminders(tx, beforeTime));
      await platform((tx) => queueSmsReminders(tx, tooLate));
      expect((await logOf(s.id)).filter((row) => row.channel === "sms")).toHaveLength(0);
      await platform((tx) => queueSmsReminders(tx, atTime));
      await platform((tx) => queueSmsReminders(tx, atTime));
      await dispatch(s.id, atTime);
      const sms = fake.sms.filter(
        (item) => item.to === "+33612345678" && item.text.includes(`Belle Époque ${n}`),
      );
      expect(sms).toHaveLength(1);
      expect(plain(sms[0].text)).toBe(
        `Rappel : rendez-vous demain à 10:00 chez Belle Époque ${n}. Pour annuler ou déplacer : +33 4 72 00 00 00`,
      );
      expect(sms[0].sender).toBe(smsSenderName(`Belle Époque ${n}`, "Horaneo"));
      expect(sms[0].sender.length).toBeLessThanOrEqual(11);
      const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
      expect(counter.smsSent).toBe(1);
      const smsRows = (await logOf(s.id)).filter((row) => row.channel === "sms");
      expect(smsRows.map((row) => row.appointmentId)).not.toContain(recent.appointmentId);
    });

    it("pas de SMS sur le pack Basic ; envoi bloqué au-delà du quota du mois", async () => {
      const basic = await setup("basic");
      await book(basic, { start: at("10:00") });
      await platform((tx) => queueSmsReminders(tx, localToUtc("2026-10-05", "18:05", TZ)));
      expect((await logOf(basic.id)).filter((row) => row.channel === "sms")).toHaveLength(0);

      const s = await setup("essentiel");
      await book(s, { start: at("10:00") });
      const [plan] = await owner.select().from(plans).where(eq(plans.code, "essentiel"));
      await owner
        .insert(usageCounters)
        .values({ tenantId: s.id, period: "2026-10", smsSent: plan.limits.smsPerMonth ?? 0 })
        .onConflictDoUpdate({
          target: [usageCounters.tenantId, usageCounters.period],
          set: { smsSent: plan.limits.smsPerMonth ?? 0 },
        });
      const atTime = localToUtc("2026-10-05", "18:05", TZ);
      await platform((tx) => queueSmsReminders(tx, atTime));
      expect(await dispatch(s.id, atTime)).toMatchObject({ blocked: 1 });
      expect((await logOf(s.id)).find((row) => row.channel === "sms")?.status).toBe("blocked_quota");
    });
  });

  describe("résumés pour la gérante", () => {
    it("résumé du lendemain chaque soir, seulement s'il y a des rendez-vous et si elle le souhaite", async () => {
      const s = await setup();
      await book(s, { start: at("10:00") });
      await book(s, {
        start: at("14:00"),
        customer: { firstName: "Inès", email: `ines-${n}@example.com`, phone: "0611223344" },
      });
      await dispatch(s.id);
      fake.clear();
      const evening = localToUtc("2026-10-05", "19:10", TZ);
      await platform((tx) => queueSummaries(tx, evening));
      await platform((tx) => queueSummaries(tx, evening));
      await dispatch(s.id, evening);
      const summaries = emailsTo(s.managerEmail);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].subject).toBe("Demain : 2 rendez-vous");
      expect(summaries[0].text).toContain("10:00 · Camille · Massage · avec Léa");
      expect(summaries[0].text).toContain("14:00 · Inès");

      // Le lendemain soir : aucun rendez-vous le surlendemain → rien n'est envoyé.
      fake.clear();
      await platform((tx) => queueSummaries(tx, localToUtc("2026-10-06", "19:10", TZ)));
      await dispatch(s.id, localToUtc("2026-10-06", "19:10", TZ));
      expect(emailsTo(s.managerEmail)).toHaveLength(0);

      // Résumé coupé dans les réglages.
      await owner
        .update(businessSettings)
        .set({ dailySummaryEnabled: false })
        .where(eq(businessSettings.tenantId, s.id));
      const rowsBefore = (await logOf(s.id)).length;
      await platform((tx) => queueSummaries(tx, localToUtc("2026-10-07", "19:10", TZ)));
      expect((await logOf(s.id)).length).toBe(rowsBefore);
    });

    it("bilan mensuel le 1er, sur les packs qui l'incluent", async () => {
      const serenite = await setup("serenite");
      const essentiel = await setup("essentiel");
      const first = localToUtc("2026-11-01", "08:10", TZ);
      await platform((tx) => queueSummaries(tx, first));
      await dispatch(serenite.id, first);
      await dispatch(essentiel.id, first);
      expect(emailsTo(serenite.managerEmail).map((email) => email.subject)).toContain(
        "Votre bilan de octobre 2026",
      );
      expect(
        emailsTo(essentiel.managerEmail).filter((email) => email.subject.startsWith("Votre bilan")),
      ).toHaveLength(0);
    });
  });

  describe("fiabilité", () => {
    it("un envoi qui échoue est réessayé plus tard, puis abandonné après plusieurs essais", async () => {
      const s = await setup();
      await book(s);
      fake.fail(2);
      const first = await dispatch(s.id);
      expect(first).toMatchObject({ sent: 0, retried: 2 });
      // Trop tôt pour réessayer.
      expect(await dispatch(s.id)).toMatchObject({ sent: 0 });
      const later = new Date(NOW.getTime() + 3 * 60_000);
      expect(await dispatch(s.id, later)).toMatchObject({ sent: 2 });

      const other = await setup();
      await book(other);
      fake.fail(100);
      let when = NOW;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        when = new Date(when.getTime() + 60 * 60_000);
        await dispatch(other.id, when);
      }
      fake.fail(0);
      const rows = await logOf(other.id);
      expect(rows.every((row) => row.status === "failed")).toBe(true);
      expect(rows[0].attempts).toBe(5);
    });

    it("la gérante ne voit que les messages de son établissement (base)", async () => {
      const a = await setup();
      const b = await setup();
      await book(a);
      await book(b);
      const visible = await asTenant(a.id, (tx) => tx.select().from(messageLog));
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every((row) => row.tenantId === a.id)).toBe(true);
    });
  });

  describe("photos remplacées", () => {
    it("supprimées après le délai de conservation, sauf si encore utilisées", async () => {
      const s = await setup();
      const past = new Date(NOW.getTime() - 60_000);
      const [old, used] = await owner
        .insert(assets)
        .values([
          {
            tenantId: s.id,
            kind: "gallery",
            storageKey: `t/${s.id}/old.webp`,
            mimeType: "image/webp",
            bytes: 10,
            status: "replaced",
            purgeAfter: past,
          },
          {
            tenantId: s.id,
            kind: "staff",
            storageKey: `t/${s.id}/used.webp`,
            mimeType: "image/webp",
            bytes: 10,
            status: "replaced",
            purgeAfter: past,
          },
        ])
        .returning();
      await owner.execute(
        `update staff_members set photo_asset_id = '${used.id}' where id = '${s.lea.id}'` as never,
      );
      const deleted: string[] = [];
      await purgeReplacedAssets(platform, { delete: async (key) => void deleted.push(key) }, NOW);
      expect(deleted).toContain(old.storageKey);
      expect(deleted).not.toContain(used.storageKey);
      const left = await owner
        .select()
        .from(assets)
        .where(inArray(assets.id, [old.id, used.id]));
      expect(left.map((row) => row.id)).toEqual([used.id]);
    });
  });
});
