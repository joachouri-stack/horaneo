import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  payments,
  promoCodes,
  refunds,
  stripeEvents,
  businessSettings,
  businesses,
  usageCounters,
} from "@/db/schema";
import { cancelByManager } from "@/modules/agenda/actions";
import { createBusiness } from "@/modules/businesses/businesses";
import { createBooking, type BookingInput } from "@/modules/booking/create";
import { cancelByCustomer, rescheduleByCustomer } from "@/modules/booking/manage";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import { refreshAccount, startOnboarding } from "@/modules/payments/connect";
import { applyPaymentIntent, depositCheckout, syncDeposit } from "@/modules/payments/deposits";
import { refundDeposit } from "@/modules/payments/refunds";
import { handleEvent } from "@/modules/payments/webhooks";
import { computeDiscount, deletePromoCode, previewPromo, savePromoCode } from "@/modules/promo/codes";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeGateway } from "../setup/fake-gateway";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Paiements des acomptes (Stripe Connect simulé), remboursements, événements
 * Stripe et codes promo, sur vraie base avec les rôles restreints.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const DAY = "2026-10-06";
const at = (time: string, date = DAY) => localToUtc(date, time, TZ);
const minutesLater = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe.skipIf(!hasTestDatabase)("paiements", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const fake = createFakeGateway();

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

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  /** Établissement Sérénité ouvert le mardi, Léa fait le massage (70 €), acompte 30 %, Stripe prêt. */
  async function setup({ planCode = "serenite", connected = true, deposit = true } = {}) {
    n += 1;
    const slug = `pay-${n}-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, { name: `Institut Belle ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    const businessId = business.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    const lea = await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    if (deposit) {
      await owner
        .update(businessSettings)
        .set({ depositEnabled: true, depositType: "percent", depositValue: 30 })
        .where(eq(businessSettings.tenantId, id));
    }
    let accountId: string | null = null;
    if (connected) {
      const started = await platform((tx) =>
        startOnboarding(tx, id, businessId, fake.gateway, {
          returnUrl: "https://x/retour",
          refreshUrl: "https://x/relance",
        }),
      );
      accountId = started.accountId;
      fake.activate(accountId);
      await platform((tx) => refreshAccount(tx, id, businessId, fake.gateway));
    }
    return { id, businessId, massage, lea, accountId: accountId! };
  }

  const customer = () => ({
    firstName: "Camille",
    email: `cliente-${Math.random().toString(36).slice(2, 8)}@example.com`,
    phone: "06 12 34 56 78",
  });

  function book(s: { id: string; massage: { id: string } }, input: Partial<BookingInput> = {}, now = NOW) {
    return asTenant(s.id, (tx) =>
      createBooking(
        tx,
        s.id,
        { serviceIds: [s.massage.id], staffId: null, start: at("10:00"), customer: customer(), ...input },
        { now, gateway: fake.gateway },
      ),
    );
  }

  async function appointment(id: string) {
    const [row] = await owner.select().from(appointments).where(eq(appointments.id, id));
    return row;
  }

  async function paymentOf(appointmentId: string) {
    const [row] = await owner.select().from(payments).where(eq(payments.appointmentId, appointmentId));
    return row;
  }

  async function refundsOf(paymentId: string) {
    return owner.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  }

  /** La cliente paie, puis l'information revient (navigateur). */
  async function payAndSync(s: { id: string }, appointmentId: string) {
    const payment = await paymentOf(appointmentId);
    fake.pay(payment.stripePaymentIntentId);
    return asTenant(s.id, (tx) => syncDeposit(tx, s.id, appointmentId, fake.gateway, minutesLater(15)));
  }

  describe("compte Stripe du professionnel", () => {
    it("crée le compte une seule fois, puis suit son état", async () => {
      const s = await setup({ connected: false });
      const first = await platform((tx) =>
        startOnboarding(tx, s.id, s.businessId, fake.gateway, {
          returnUrl: "https://x/r",
          refreshUrl: "https://x/f",
        }),
      );
      expect(first.url).toContain(first.accountId);
      const again = await platform((tx) =>
        startOnboarding(tx, s.id, s.businessId, fake.gateway, {
          returnUrl: "https://x/r",
          refreshUrl: "https://x/f",
        }),
      );
      expect(again.accountId).toBe(first.accountId);
      // Libellé sur le relevé : le nom de l'établissement.
      const created = fake.calls.filter((call) => call.method === "createAccount:input");
      expect(created.at(-1)?.input).toMatchObject({ statementDescriptor: `INSTITUT BELLE ${n}` });

      expect(await platform((tx) => refreshAccount(tx, s.id, s.businessId, fake.gateway))).toBe("incomplete");
      // Stripe signale la fin des étapes guidées.
      const event = fake.event("account.updated", first.accountId, {
        id: first.accountId,
        charges_enabled: true,
        details_submitted: true,
      });
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
        outcome: "processed",
        detail: "account_synced",
      });
      const [business] = await owner.select().from(businesses).where(eq(businesses.id, s.businessId));
      expect(business.stripeChargesEnabled).toBe(true);
    });

    it("refuse l'ouverture sur un pack sans paiement en ligne, ou sans clés Stripe", async () => {
      const basic = await setup({ planCode: "basic", connected: false, deposit: false });
      const urls = { returnUrl: "https://x/r", refreshUrl: "https://x/f" };
      expect(
        await errorCode(
          platform((tx) => startOnboarding(tx, basic.id, basic.businessId, fake.gateway, urls)),
        ),
      ).toBe("feature_unavailable");
      expect(
        await errorCode(platform((tx) => startOnboarding(tx, basic.id, basic.businessId, null, urls))),
      ).toBe("payments_unavailable");
    });

    it("la gérante ne peut pas modifier elle-même son compte Stripe (base)", async () => {
      const s = await setup({ connected: false });
      await expect(
        asTenant(s.id, (tx) =>
          tx
            .update(businesses)
            .set({ stripeAccountId: "acct_pirate" })
            .where(eq(businesses.id, s.businessId)),
        ),
      ).rejects.toThrow();
    });
  });

  describe("acompte", () => {
    it("crée le paiement sur le compte du professionnel, sans commission", async () => {
      const s = await setup();
      const result = await book(s);
      expect(result).toMatchObject({ status: "pending_payment", depositCents: 2100 });
      expect(result.payment).toMatchObject({ accountId: s.accountId, publishableKey: "pk_test_fake" });
      const payment = await paymentOf(result.appointmentId);
      expect(payment).toMatchObject({
        amountCents: 2100,
        applicationFeeCents: 0,
        stripeAccountId: s.accountId,
        status: "requires_payment",
      });
      expect(fake.intents.get(payment.stripePaymentIntentId)?.metadata).toMatchObject({
        tenant_id: s.id,
        appointment_id: result.appointmentId,
      });
      const checkout = await asTenant(s.id, (tx) =>
        depositCheckout(tx, s.id, result.appointmentId, fake.gateway),
      );
      expect(checkout?.clientSecret).toBe(result.payment?.clientSecret);
    });

    it("confirme le rendez-vous quand le paiement aboutit (navigateur puis événement : une seule fois)", async () => {
      const s = await setup();
      const result = await book(s);
      const payment = await payAndSync(s, result.appointmentId);
      expect(payment?.status).toBe("succeeded");
      expect(await appointment(result.appointmentId)).toMatchObject({
        status: "confirmed",
        holdExpiresAt: null,
      });

      const event = fake.event("payment_intent.succeeded", s.accountId, {
        id: payment!.stripePaymentIntentId,
        status: "succeeded",
      });
      await platform((tx) => handleEvent(tx, event, fake.gateway));
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toEqual({ outcome: "duplicate" });
      const [stored] = await owner.select().from(stripeEvents).where(eq(stripeEvents.id, event.id));
      expect(stored.processedAt).not.toBeNull();
      expect(await appointment(result.appointmentId)).toMatchObject({ status: "confirmed" });
    });

    it("confirme aussi par l'événement seul (cliente qui ferme la page)", async () => {
      const s = await setup();
      const result = await book(s);
      const payment = await paymentOf(result.appointmentId);
      fake.pay(payment.stripePaymentIntentId);
      const event = fake.event("payment_intent.succeeded", s.accountId, {
        id: payment.stripePaymentIntentId,
        status: "succeeded",
      });
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
        detail: "confirmed",
      });
      expect((await appointment(result.appointmentId)).status).toBe("confirmed");
    });

    it("paiement après les 10 minutes : rendez-vous repris s'il est libre", async () => {
      const s = await setup();
      const result = await book(s);
      // Un autre visiteur déclenche la libération des réservations expirées.
      await book(s, { start: at("14:00") }, minutesLater(11));
      expect((await appointment(result.appointmentId)).status).toBe("expired");
      await payAndSync(s, result.appointmentId);
      expect((await appointment(result.appointmentId)).status).toBe("confirmed");
    });

    it("paiement après les 10 minutes, créneau repris entre-temps : remboursement automatique", async () => {
      const s = await setup({ deposit: true });
      const first = await book(s);
      // 11 minutes plus tard, une autre cliente prend le même créneau (sans acompte).
      await owner
        .update(businessSettings)
        .set({ depositEnabled: false })
        .where(eq(businessSettings.tenantId, s.id));
      const second = await book(s, {}, minutesLater(11));
      expect(second.status).toBe("confirmed");
      const payment = await payAndSync(s, first.appointmentId);
      expect((await appointment(first.appointmentId)).status).toBe("expired");
      const rows = await refundsOf(payment!.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ amountCents: 2100, reason: "slot_taken", status: "succeeded" });
    });

    it("paiement tardif d'un rendez-vous dont l'heure est passée : remboursé, jamais repris", async () => {
      const s = await setup();
      const result = await book(s);
      await book(s, { start: at("14:00") }, minutesLater(11));
      const payment = await paymentOf(result.appointmentId);
      fake.pay(payment.stripePaymentIntentId);
      const event = fake.event("payment_intent.succeeded", s.accountId, {
        id: payment.stripePaymentIntentId,
        status: "succeeded",
      });
      // L'information n'arrive que le lendemain du rendez-vous.
      await platform((tx) =>
        applyPaymentIntent(
          tx,
          s.id,
          { id: payment.stripePaymentIntentId, status: "succeeded" },
          fake.gateway,
          {
            now: at("12:00", "2026-10-07"),
          },
        ),
      );
      expect(event.type).toBe("payment_intent.succeeded");
      expect((await appointment(result.appointmentId)).status).toBe("expired");
      expect(await refundsOf(payment.id)).toMatchObject([{ reason: "slot_taken", amountCents: 2100 }]);
    });

    it("réservation abandonnée : le code promo et la réservation du mois sont rendus, puis repris si elle paie tard", async () => {
      const s = await setup();
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "UNIQUE", discountType: "fixed", discountValue: "5", maxUses: 1 }),
      );
      const abandoned = await book(s, { promoCode: "UNIQUE" });
      const usage = async () => {
        const [code] = await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id));
        const [counter] = await owner.select().from(usageCounters).where(eq(usageCounters.tenantId, s.id));
        return { promo: code.usedCount, bookings: counter.onlineBookings };
      };
      expect(await usage()).toEqual({ promo: 1, bookings: 1 });
      // 11 minutes plus tard, une autre cliente utilise le même code (unique) sur un autre créneau.
      const other = await book(s, { promoCode: "UNIQUE", start: at("14:00") }, minutesLater(11));
      expect((await appointment(abandoned.appointmentId)).status).toBe("expired");
      expect(other.discountCents).toBe(500);
      expect(await usage()).toEqual({ promo: 1, bookings: 1 });
      // La première paie finalement : son rendez-vous est repris et compté à nouveau.
      await payAndSync(s, abandoned.appointmentId);
      expect((await appointment(abandoned.appointmentId)).status).toBe("confirmed");
      // Code à usage unique déjà repris : son compteur ne dépasse pas la limite.
      expect(await usage()).toEqual({ promo: 1, bookings: 2 });
    });

    it("site à plusieurs entreprises : paiement tardif sur un créneau repris, remboursé par l'événement Stripe", async () => {
      const s = await setup();
      const first = await book(s);
      // Le site accueille une deuxième entreprise : plus d'entreprise « par défaut ».
      await platform((tx) => createBusiness(tx, s.id, { name: "Seconde", siret: "987 654 321 00019" }));
      await owner
        .update(businessSettings)
        .set({ depositEnabled: false })
        .where(eq(businessSettings.businessId, s.businessId));
      const second = await withTenant(
        s.id,
        (tx) =>
          createBooking(
            tx,
            s.id,
            { serviceIds: [s.massage.id], staffId: null, start: at("10:00"), customer: customer() },
            { now: minutesLater(11), gateway: fake.gateway },
          ),
        app,
        s.businessId,
      );
      expect(second.status).toBe("confirmed");
      const payment = await paymentOf(first.appointmentId);
      fake.pay(payment.stripePaymentIntentId);
      const event = fake.event("payment_intent.succeeded", s.accountId, {
        id: payment.stripePaymentIntentId,
        status: "succeeded",
      });
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
        detail: "refunded",
      });
      expect(await refundsOf(payment.id)).toMatchObject([
        { reason: "slot_taken", amountCents: 2100, businessId: s.businessId },
      ]);
    });

    it("un échec de paiement est noté, la cliente peut réessayer", async () => {
      const s = await setup();
      const result = await book(s);
      const payment = await paymentOf(result.appointmentId);
      const failed = fake.event("payment_intent.payment_failed", s.accountId, {
        id: payment.stripePaymentIntentId,
        status: "requires_payment_method",
      });
      await platform((tx) => handleEvent(tx, failed, fake.gateway));
      expect((await paymentOf(result.appointmentId)).status).toBe("failed");
      expect((await appointment(result.appointmentId)).status).toBe("pending_payment");
      await payAndSync(s, result.appointmentId);
      expect((await appointment(result.appointmentId)).status).toBe("confirmed");
    });

    it("Stripe indisponible : la réservation n'est pas enregistrée", async () => {
      const s = await setup();
      fake.failNext("createPaymentIntent");
      expect(await errorCode(book(s))).toBe("payment_provider_error");
      expect(await owner.select().from(appointments).where(eq(appointments.tenantId, s.id))).toHaveLength(0);
    });
  });

  describe("remboursements", () => {
    it("annulation par la cliente dans le délai : remboursement automatique et complet", async () => {
      const s = await setup();
      const result = await book(s);
      const payment = await payAndSync(s, result.appointmentId);
      const cancelled = await asTenant(s.id, (tx) =>
        cancelByCustomer(tx, s.id, result.manageToken, NOW, fake.gateway),
      );
      expect(cancelled.refundedCents).toBe(2100);
      const rows = await refundsOf(payment!.id);
      expect(rows).toMatchObject([{ amountCents: 2100, reason: "customer_cancelled", status: "succeeded" }]);
      expect(fake.refunds.get(rows[0].stripeRefundId!)?.accountId).toBe(s.accountId);
      // Rien de plus à rembourser.
      expect(
        await asTenant(s.id, (tx) =>
          refundDeposit(tx, s.id, result.appointmentId, fake.gateway, { reason: "manager_cancelled" }),
        ),
      ).toBeNull();
    });

    it("Stripe refuse le remboursement : l'annulation n'est pas faite", async () => {
      const s = await setup();
      const result = await book(s);
      await payAndSync(s, result.appointmentId);
      fake.failNext("createRefund");
      expect(
        await errorCode(
          asTenant(s.id, (tx) => cancelByCustomer(tx, s.id, result.manageToken, NOW, fake.gateway)),
        ),
      ).toBe("payment_provider_error");
      expect((await appointment(result.appointmentId)).status).toBe("confirmed");
    });

    it("annulation par la gérante : elle choisit de rembourser ou non", async () => {
      const s = await setup();
      const kept = await book(s, { start: at("10:00") });
      const refunded = await book(s, { start: at("14:00") });
      const keptPayment = await payAndSync(s, kept.appointmentId);
      const refundedPayment = await payAndSync(s, refunded.appointmentId);

      await asTenant(s.id, (tx) =>
        cancelByManager(tx, s.id, kept.appointmentId, "Fermeture", { refund: false, gateway: fake.gateway }),
      );
      expect(await refundsOf(keptPayment!.id)).toHaveLength(0);
      const result = await asTenant(s.id, (tx) =>
        cancelByManager(tx, s.id, refunded.appointmentId, undefined, { refund: true, gateway: fake.gateway }),
      );
      expect(result.refundedCents).toBe(2100);
      expect(await refundsOf(refundedPayment!.id)).toMatchObject([{ reason: "manager_cancelled" }]);
    });

    it("le report garde l'acompte, remboursable ensuite sur le nouveau rendez-vous", async () => {
      const s = await setup();
      const result = await book(s);
      const payment = await payAndSync(s, result.appointmentId);
      const moved = await asTenant(s.id, (tx) =>
        rescheduleByCustomer(tx, s.id, result.manageToken, { start: at("15:00"), staffId: null }, NOW),
      );
      expect((await paymentOf(moved.appointmentId)).id).toBe(payment!.id);
      await asTenant(s.id, (tx) => cancelByCustomer(tx, s.id, moved.manageToken, NOW, fake.gateway));
      expect(await refundsOf(payment!.id)).toHaveLength(1);
    });

    it("un paiement reçu pour un rendez-vous déjà annulé est remboursé", async () => {
      const s = await setup();
      const result = await book(s);
      await asTenant(s.id, (tx) => cancelByManager(tx, s.id, result.appointmentId));
      const payment = await payAndSync(s, result.appointmentId);
      expect(await refundsOf(payment!.id)).toMatchObject([{ reason: "slot_taken" }]);
    });

    it("un remboursement fait depuis le tableau de bord Stripe est enregistré", async () => {
      const s = await setup();
      const result = await book(s);
      const payment = await payAndSync(s, result.appointmentId);
      const event = fake.event("refund.created", s.accountId, {
        id: "re_dashboard_1",
        status: "succeeded",
        amount: 1000,
        payment_intent: payment!.stripePaymentIntentId,
        metadata: {},
      });
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
        detail: "recorded",
      });
      expect(await refundsOf(payment!.id)).toMatchObject([{ amountCents: 1000, reason: "external" }]);
      // Le reste (11 €) peut encore être remboursé.
      const rest = await asTenant(s.id, (tx) =>
        refundDeposit(tx, s.id, result.appointmentId, fake.gateway, { reason: "manager_cancelled" }),
      );
      expect(rest?.amountCents).toBe(1100);
    });

    it("événement d'un compte inconnu : ignoré sans erreur", async () => {
      const event = fake.event("payment_intent.succeeded", "acct_inconnu", {
        id: "pi_x",
        status: "succeeded",
      });
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
        detail: "unknown_account",
      });
    });
  });

  describe("codes promo", () => {
    it("calcule la réduction (pourcentage, montant, dates, utilisations)", () => {
      const base = {
        discountType: "percent" as const,
        discountValue: 10,
        validFrom: null,
        validUntil: null,
        maxUses: null,
        usedCount: 0,
        isActive: true,
      };
      expect(computeDiscount(base, 7000, NOW)).toBe(700);
      expect(computeDiscount({ ...base, discountType: "fixed", discountValue: 9000 }, 7000, NOW)).toBe(7000);
      expect(computeDiscount({ ...base, isActive: false }, 7000, NOW)).toBeNull();
      expect(computeDiscount({ ...base, validUntil: NOW }, 7000, NOW)).toBeNull();
      expect(computeDiscount({ ...base, validFrom: minutesLater(1) }, 7000, NOW)).toBeNull();
      expect(computeDiscount({ ...base, maxUses: 2, usedCount: 2 }, 7000, NOW)).toBeNull();
    });

    it("réduit le total ; l'acompte se calcule sur le total réduit", async () => {
      const s = await setup();
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "bienvenue", discountType: "percent", discountValue: "20" }),
      );
      const result = await book(s, { promoCode: "Bienvenue" });
      // 70 € − 20 % = 56 € ; acompte 30 % = 16,80 €.
      expect(result).toMatchObject({ totalCents: 5600, discountCents: 1400, depositCents: 1680 });
      const row = await appointment(result.appointmentId);
      expect(row.promoCodeId).not.toBeNull();
      const [code] = await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id));
      expect(code.usedCount).toBe(1);
    });

    it("refuse un code inconnu, et respecte le nombre d'utilisations même en simultané", async () => {
      const s = await setup({ deposit: false });
      expect(await errorCode(book(s, { promoCode: "NOPE" }))).toBe("promo_code_invalid");
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "UNEFOIS", discountType: "fixed", discountValue: "5", maxUses: 1 }),
      );
      // A utilise le code mais ne valide qu'après 400 ms : B lit encore « 0 utilisation »,
      // puis la base le fait attendre et refuse la seconde utilisation.
      const first = asTenant(s.id, async (tx) => {
        const result = await createBooking(
          tx,
          s.id,
          {
            serviceIds: [s.massage.id],
            staffId: null,
            start: at("10:00"),
            customer: customer(),
            promoCode: "UNEFOIS",
          },
          { now: NOW, gateway: fake.gateway },
        );
        await new Promise((resolve) => setTimeout(resolve, 400));
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      const second = book(s, { promoCode: "UNEFOIS", start: at("14:00") });
      expect((await first).discountCents).toBe(500);
      expect(await errorCode(second)).toBe("promo_code_invalid");
      const [code] = await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id));
      expect(code.usedCount).toBe(1);
    });

    it("un rendez-vous annulé rend son code promo (code à usage unique de nouveau utilisable)", async () => {
      const s = await setup({ deposit: false });
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "RENDU", discountType: "fixed", discountValue: "5", maxUses: 1 }),
      );
      const result = await book(s, { promoCode: "RENDU" });
      await asTenant(s.id, (tx) => cancelByCustomer(tx, s.id, result.manageToken, NOW, fake.gateway));
      const [code] = await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id));
      expect(code.usedCount).toBe(0);
      expect((await book(s, { promoCode: "RENDU", start: at("14:00") })).discountCents).toBe(500);
    });

    it("un code promo ne sert qu'une fois par cliente", async () => {
      const s = await setup({ deposit: false });
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "MERCI", discountType: "fixed", discountValue: "5" }),
      );
      const me = customer();
      const first = await book(s, { promoCode: "MERCI", customer: me });
      expect(first.discountCents).toBe(500);
      expect(await errorCode(book(s, { promoCode: "merci", customer: { ...me }, start: at("14:00") }))).toBe(
        "promo_code_already_used",
      );
      // Une autre cliente peut l'utiliser ; et après une annulation, la cliente peut le réutiliser.
      expect((await book(s, { promoCode: "MERCI", start: at("12:00") })).discountCents).toBe(500);
      await asTenant(s.id, (tx) => cancelByManager(tx, s.id, first.appointmentId));
      expect((await book(s, { promoCode: "MERCI", customer: me, start: at("15:00") })).discountCents).toBe(
        500,
      );
    });

    it("dates de validité dans le fuseau de l'établissement, « jusqu'au » inclus", async () => {
      const s = await setup({ deposit: false });
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, {
          code: "OCTOBRE",
          discountType: "percent",
          discountValue: "10",
          validFrom: "2026-10-01",
          validUntil: "2026-10-05",
        }),
      );
      const preview = (now: Date) =>
        errorCode(asTenant(s.id, (tx) => previewPromo(tx, s.id, "octobre", 7000, now)));
      expect(await preview(localToUtc("2026-10-05", "23:59", TZ))).toBeUndefined();
      expect(await preview(localToUtc("2026-10-06", "00:00", TZ))).toBe("promo_code_invalid");
      expect(await preview(localToUtc("2026-09-30", "23:59", TZ))).toBe("promo_code_invalid");
    });

    it("code en double refusé ; un code utilisé est désactivé au lieu d'être supprimé", async () => {
      const s = await setup({ deposit: false });
      const code = await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "ETE", discountType: "percent", discountValue: "10" }),
      );
      expect(
        await errorCode(
          asTenant(s.id, (tx) =>
            savePromoCode(tx, s.id, { code: "ete", discountType: "fixed", discountValue: "5" }),
          ),
        ),
      ).toBe("promo_code_taken");
      await book(s, { promoCode: "ETE" });
      expect(await asTenant(s.id, (tx) => deletePromoCode(tx, s.id, code.id))).toEqual({ deleted: false });
      expect(await errorCode(book(s, { promoCode: "ETE", start: at("14:00") }))).toBe("promo_code_invalid");
    });

    it("pas de codes promo sur le pack Basic", async () => {
      const s = await setup({ planCode: "basic", connected: false, deposit: false });
      expect(
        await errorCode(
          asTenant(s.id, (tx) =>
            savePromoCode(tx, s.id, { code: "BASIC", discountType: "percent", discountValue: "10" }),
          ),
        ),
      ).toBe("feature_unavailable");
    });
  });
});
