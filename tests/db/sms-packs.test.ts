import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  messageLog,
  orders,
  plans,
  platformSettings,
  smsPacks,
  subscriptions,
  usageCounters,
  users,
} from "@/db/schema";
import { handleBillingEvent, type BillingEvent } from "@/modules/billing/events";
import { startSmsPackPurchase, syncSmsPackPayment } from "@/modules/billing/sms-packs";
import { applyPriceChanges } from "@/modules/billing/price-change";
import { applySubscription, requestPlanChange } from "@/modules/billing/subscriptions";
import { createBooking, type BookingInput } from "@/modules/booking/create";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import { dispatchMessages } from "@/modules/messages/dispatch";
import { queueEmailReminders, queueSmsReminders } from "@/modules/messages/schedule";
import { reserveSms, smsUsage } from "@/modules/messages/sms-usage";
import { createOrder } from "@/modules/orders/orders";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeBilling } from "../setup/fake-billing";
import { createFakeGateway } from "../setup/fake-gateway";
import { createFakeSenders } from "../setup/fake-senders";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, withLegacyCatalog, type TestDb } from "../setup/db";

/**
 * SMS et formules d'engagement sur vraie base : quota du mois, packs achetés,
 * alertes à la gérante, remise à zéro mensuelle, formule avec ou sans engagement.
 * « Maintenant » = lundi 5 octobre 2026, 9 h à Paris.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const urls = { successUrl: "https://app.test/ok", cancelUrl: "https://app.test/annule" };

describe.skipIf(!hasTestDatabase)("SMS et engagement", () => {
  let owner: TestDb;
  let restoreCatalog: (() => Promise<void>) | undefined;
  let app: TestDb;
  let n = 0;
  let eventCounter = 0;
  const fake = createFakeSenders();
  const payments = createFakeGateway();
  const billing = createFakeBilling();

  let closeSales: (() => Promise<unknown>) | undefined;

  beforeAll(async () => {
    owner = await openTestDb();
    // Ces tests vérifient les mécanismes d'abonnement avec les anciens packs.
    restoreCatalog = await withLegacyCatalog(owner);
    app = openAppDb();
    // Pages légales publiées : la commande en ligne des packs payants est ouverte.
    closeSales = await openSales(owner);
  });

  afterAll(async () => {
    await restoreCatalog?.();
    await closeSales?.();
    // Taux de TVA créé dans ce faux Stripe : un autre fichier de test (autre faux Stripe) ne doit pas le reprendre.
    await owner?.delete(platformSettings).where(eq(platformSettings.key, "stripe_tax_rate"));
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

  async function planOf(code: string) {
    const [plan] = await owner.select().from(plans).where(eq(plans.code, code));
    return plan;
  }

  async function setup(planCode = "essentiel") {
    n += 1;
    const slug = `sms-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: `Atelier ${n}`,
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
    await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    return { id, massage, managerEmail: `${slug}@example.com` };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  async function book(s: Setup, input: Partial<BookingInput> = {}) {
    const result = await asTenant(s.id, (tx) =>
      createBooking(
        tx,
        s.id,
        {
          serviceIds: [s.massage.id],
          staffId: null,
          start: localToUtc("2026-10-08", "10:00", TZ),
          customer: { firstName: "Camille", email: `camille-${n}@example.com`, phone: "06 12 34 56 78" },
          locale: "fr",
          ...input,
        },
        { now: NOW, gateway: payments.gateway },
      ),
    );
    await owner.update(appointments).set({ createdAt: NOW }).where(eq(appointments.id, result.appointmentId));
    return result;
  }

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

  async function setUsed(tenantId: string, period: string, smsSent: number) {
    await owner
      .insert(usageCounters)
      .values({ tenantId, period, smsSent })
      .onConflictDoUpdate({ target: [usageCounters.tenantId, usageCounters.period], set: { smsSent } });
  }

  async function counter(tenantId: string, period = "2026-10") {
    const [row] = await owner
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period)));
    return row;
  }

  const send = (
    event: Omit<Extract<BillingEvent, { kind: "checkout_completed" }>, "id" | "type" | "raw">,
  ) => {
    const id = `evt_sms_${(eventCounter += 1)}_${Date.now()}`;
    return platform((tx) =>
      handleBillingEvent(
        tx,
        { id, type: "checkout.session.completed", raw: { id }, ...event },
        billing.gateway,
      ),
    );
  };

  /** Achat d'un pack par la gérante : page de paiement, puis paiement confirmé par Stripe. */
  async function buyPack(tenantId: string) {
    const url = await platform((tx) =>
      startSmsPackPurchase(tx, tenantId, { userId: null, ...urls }, billing.gateway),
    );
    const checkoutId = url.split("/").at(-1)!;
    billing.completePayment(checkoutId);
    const metadata = billing.payments.get(checkoutId)!.metadata;
    await send({
      kind: "checkout_completed",
      subscriptionId: null,
      checkoutId,
      paymentStatus: "paid",
      metadata,
    });
    return checkoutId;
  }

  describe("quota du mois", () => {
    it("quota atteint : le SMS n'est pas envoyé, le rappel par e-mail part quand même, rien n'est facturé", async () => {
      const s = await setup();
      await book(s);
      await dispatch(s.id);
      fake.clear();
      const limit = (await planOf("essentiel")).limits.smsPerMonth!;
      expect(limit).toBe(100);
      await setUsed(s.id, "2026-10", limit);

      const noon = localToUtc("2026-10-07", "12:05", TZ);
      const evening = localToUtc("2026-10-07", "18:05", TZ);
      await platform((tx) => queueEmailReminders(tx, noon));
      await platform((tx) => queueSmsReminders(tx, evening));
      expect(await dispatch(s.id, evening)).toMatchObject({ blocked: 1 });

      expect(fake.sms).toHaveLength(0);
      expect(fake.emails.filter((email) => email.subject.startsWith("Rappel"))).toHaveLength(1);
      const rows = await owner.select().from(messageLog).where(eq(messageLog.tenantId, s.id));
      expect(rows.find((row) => row.templateKey === "customer.reminder_sms")?.status).toBe("blocked_quota");
      // La gérante est prévenue (une seule fois), et aucun pack n'a été acheté pour elle.
      expect(rows.filter((row) => row.templateKey === "manager.sms_quota")).toHaveLength(1);
      expect(await owner.select().from(smsPacks).where(eq(smsPacks.tenantId, s.id))).toHaveLength(0);
      expect((await counter(s.id)).smsSent).toBe(limit);
    });

    it("le compteur repart à zéro chaque mois, sans report des SMS non utilisés", async () => {
      const s = await setup();
      const limit = (await planOf("essentiel")).limits.smsPerMonth!;
      await setUsed(s.id, "2026-10", limit);
      const october = localToUtc("2026-10-31", "20:00", TZ);
      expect(await platform((tx) => reserveSms(tx, s.id, october))).toBeNull();
      expect(await asTenant(s.id, (tx) => smsUsage(tx, s.id, october))).toMatchObject({
        period: "2026-10",
        used: limit,
        remaining: 0,
        resetsOn: "2026-11-01",
      });

      // Le 1er novembre à minuit dix (heure de l'établissement) : nouveau mois, quota complet.
      const november = localToUtc("2026-11-01", "00:10", TZ);
      expect(await platform((tx) => reserveSms(tx, s.id, november))).toMatchObject({
        period: "2026-11",
        fromQuota: 1,
        fromPacks: [],
      });
      expect(await asTenant(s.id, (tx) => smsUsage(tx, s.id, november))).toMatchObject({
        used: 1,
        remaining: limit - 1,
        resetsOn: "2026-12-01",
      });
      // Un mois de 300 SMS non utilisés ne s'ajoute pas au suivant.
      const unused = await setup("serenite");
      const next = await asTenant(unused.id, (tx) => smsUsage(tx, unused.id, november));
      expect(next?.remaining).toBe((await planOf("serenite")).limits.smsPerMonth);
    });

    it("un message long compte pour chacun de ses SMS", async () => {
      const s = await setup();
      expect(await platform((tx) => reserveSms(tx, s.id, NOW, 3))).toMatchObject({ fromQuota: 3 });
      expect((await counter(s.id)).smsSent).toBe(3);
    });

    it("alerte la gérante à 80 % puis à 100 % du quota, une fois par mois", async () => {
      const s = await setup();
      const limit = (await planOf("essentiel")).limits.smsPerMonth!;
      await setUsed(s.id, "2026-10", Math.ceil(limit * 0.8) - 1);
      await platform((tx) => reserveSms(tx, s.id, NOW));
      await platform((tx) => reserveSms(tx, s.id, NOW));
      await setUsed(s.id, "2026-10", limit - 1);
      await platform((tx) => reserveSms(tx, s.id, NOW));
      // Mois suivant : de nouvelles alertes sont possibles.
      await setUsed(s.id, "2026-11", Math.ceil(limit * 0.8) - 1);
      await platform((tx) => reserveSms(tx, s.id, localToUtc("2026-11-03", "10:00", TZ)));

      const alerts = await owner
        .select()
        .from(messageLog)
        .where(and(eq(messageLog.tenantId, s.id), eq(messageLog.templateKey, "manager.sms_quota")));
      expect(alerts.map((row) => (row.data as { level: number }).level).sort((a, b) => a - b)).toEqual([
        80, 80, 100,
      ]);

      fake.clear();
      await dispatch(s.id);
      const subjects = fake.emails
        .filter((email) => email.to.includes(s.managerEmail))
        .map((email) => email.subject);
      expect(subjects).toContain("80 % de vos SMS du mois sont utilisés");
      expect(subjects).toContain("Vos SMS du mois sont épuisés");
    });
  });

  describe("SMS supplémentaires", () => {
    it("un pack acheté n'est utilisé qu'une fois le quota du mois épuisé, puis s'épuise à son tour", async () => {
      const s = await setup();
      const limit = (await planOf("essentiel")).limits.smsPerMonth!;
      const checkoutId = await buyPack(s.id);
      // Événement reçu deux fois et retour de la gérante : crédité une seule fois.
      const metadata = billing.payments.get(checkoutId)!.metadata;
      await send({
        kind: "checkout_completed",
        subscriptionId: null,
        checkoutId,
        paymentStatus: "paid",
        metadata,
      });
      await platform((tx) => syncSmsPackPayment(tx, s.id, checkoutId, billing.gateway));
      const [pack] = await owner.select().from(smsPacks).where(eq(smsPacks.tenantId, s.id));
      expect(pack).toMatchObject({ status: "paid", quantity: 100, remaining: 100, priceCents: 800 });

      // Quota pas encore épuisé : le pack n'est pas touché.
      await setUsed(s.id, "2026-10", limit - 1);
      expect(await platform((tx) => reserveSms(tx, s.id, NOW, 2))).toMatchObject({
        fromQuota: 1,
        fromPacks: [{ id: pack.id, count: 1 }],
      });
      expect(await asTenant(s.id, (tx) => smsUsage(tx, s.id, NOW))).toMatchObject({
        used: limit,
        remaining: 0,
        fromPacks: 1,
        packsRemaining: 99,
      });

      // Le rappel de la veille part grâce au pack.
      await book(s);
      await dispatch(s.id);
      fake.clear();
      const evening = localToUtc("2026-10-07", "18:05", TZ);
      await platform((tx) => queueSmsReminders(tx, evening));
      expect(await dispatch(s.id, evening)).toMatchObject({ sent: 1, blocked: 0 });
      expect(fake.sms).toHaveLength(1);
      expect((await counter(s.id)).smsFromPacks).toBe(2);

      // Pack épuisé : plus d'envoi.
      await owner.update(smsPacks).set({ remaining: 0 }).where(eq(smsPacks.id, pack.id));
      expect(await platform((tx) => reserveSms(tx, s.id, NOW))).toBeNull();
    });

    it("un pack pas encore payé n'est jamais utilisé", async () => {
      const s = await setup();
      await platform((tx) => startSmsPackPurchase(tx, s.id, { userId: null, ...urls }, billing.gateway));
      await setUsed(s.id, "2026-10", (await planOf("essentiel")).limits.smsPerMonth!);
      expect(await platform((tx) => reserveSms(tx, s.id, NOW))).toBeNull();
      expect(await asTenant(s.id, (tx) => smsUsage(tx, s.id, NOW))).toMatchObject({ packsRemaining: 0 });
    });

    it("pack Basic : aucun SMS, achat de pack refusé", async () => {
      const s = await setup("basic");
      expect(
        await errorCode(
          platform((tx) => startSmsPackPurchase(tx, s.id, { userId: null, ...urls }, billing.gateway)),
        ),
      ).toBe("feature_unavailable");
      expect(await platform((tx) => reserveSms(tx, s.id, NOW))).toBeNull();
    });

    it("fin de l'abonnement : les SMS achetés ne sont plus disponibles", async () => {
      const s = await setup("basic");
      const essentiel = await planOf("essentiel");
      const redirect = await platform((tx) =>
        requestPlanChange(tx, s.id, essentiel.id, billing.gateway, urls),
      );
      const subscription = billing.completeCheckout(
        (redirect as { url: string }).url.split("/").at(-1)!,
        NOW,
      );
      await platform((tx) => applySubscription(tx, subscription, NOW));
      await buyPack(s.id);
      await platform((tx) => applySubscription(tx, billing.setStatus(subscription.id, "canceled"), NOW));
      const [pack] = await owner.select().from(smsPacks).where(eq(smsPacks.tenantId, s.id));
      expect(pack.status).toBe("expired");
      expect(await asTenant(s.id, (tx) => smsUsage(tx, s.id, NOW))).toMatchObject({ packsRemaining: 0 });
    });
  });

  describe("nouveau prix d'un pack", () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function subscribe(planCode: string, withCommitment: boolean) {
      const s = await setup("basic");
      const plan = await planOf(planCode);
      const redirect = await platform((tx) =>
        requestPlanChange(tx, s.id, plan.id, billing.gateway, { ...urls, withCommitment }),
      );
      const checkoutId = (redirect as { url: string }).url.split("/").at(-1)!;
      await platform((tx) => applySubscription(tx, billing.completeCheckout(checkoutId, NOW), NOW));
      const [row] = await owner.select().from(subscriptions).where(eq(subscriptions.tenantId, s.id));
      return { s, plan, row };
    }

    /** Change le prix d'un pack le temps d'un test (comme l'admin), puis le remet. */
    async function withNewPrice(planCode: string, priceCents: number, fn: () => Promise<void>) {
      const before = await planOf(planCode);
      await owner.update(plans).set({ priceCents, stripePriceId: null }).where(eq(plans.id, before.id));
      try {
        await fn();
      } finally {
        await owner
          .update(plans)
          .set({ priceCents: before.priceCents, stripePriceId: before.stripePriceId })
          .where(eq(plans.id, before.id));
      }
    }

    const priceMessages = (tenantId: string) =>
      owner
        .select()
        .from(messageLog)
        .where(and(eq(messageLog.tenantId, tenantId), eq(messageLog.templateKey, "manager.price_change")));

    it("avec engagement : prix gardé jusqu'à la fin de l'engagement, préavis, puis nouveau prix sans prorata", async () => {
      const { s, row } = await subscribe("serenite", true);
      expect(row.stripePriceId).toBeTruthy();
      const oldPrice = row.stripePriceId;
      await withNewPrice("serenite", 8900, async () => {
        await platform((tx) => applyPriceChanges(tx, billing.gateway, NOW));
        let [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        expect(current.priceChangeAt?.toISOString()).toBe(row.commitmentEndsAt?.toISOString());
        expect(current.stripePriceId).toBe(oldPrice);
        expect(await priceMessages(s.id)).toHaveLength(0);

        // 30 jours avant la fin de l'engagement : la gérante est prévenue, une seule fois.
        const notice = new Date(row.commitmentEndsAt!.getTime() - 29 * DAY);
        await platform((tx) => applyPriceChanges(tx, billing.gateway, notice));
        await platform((tx) => applyPriceChanges(tx, billing.gateway, notice));
        expect(await priceMessages(s.id)).toHaveLength(1);
        [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        expect(current.stripePriceId).toBe(oldPrice);

        // À la fin de l'engagement : nouveau prix chez Stripe, sans facture immédiate.
        const after = new Date(row.commitmentEndsAt!.getTime() + DAY);
        await platform((tx) => applyPriceChanges(tx, billing.gateway, after));
        [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        const plan = await planOf("serenite");
        expect(current.stripePriceId).toBe(plan.stripePriceId);
        expect(current).toMatchObject({ priceChangeAt: null, priceChangeNotifiedAt: null });
        expect(billing.calls).toContain("repriceAtRenewal");
        expect((await billing.gateway.retrieveSubscription(row.stripeSubscriptionId!)).priceId).toBe(
          plan.stripePriceId,
        );
      });
    });

    it("sans engagement : préavis tout de suite, nouveau prix 30 jours plus tard", async () => {
      const { s, row } = await subscribe("essentiel", false);
      await withNewPrice("essentiel", 4999, async () => {
        await platform((tx) => applyPriceChanges(tx, billing.gateway, NOW));
        let [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        expect(current.priceChangeAt?.getTime()).toBe(NOW.getTime() + 30 * DAY);
        expect(await priceMessages(s.id)).toHaveLength(1);
        await platform((tx) => applyPriceChanges(tx, billing.gateway, new Date(NOW.getTime() + 10 * DAY)));
        [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        expect(current.stripePriceId).toBe(row.stripePriceId);
        await platform((tx) => applyPriceChanges(tx, billing.gateway, new Date(NOW.getTime() + 31 * DAY)));
        [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        expect(current.stripePriceId).toBe((await planOf("essentiel")).stripePriceId);
      });
    });

    it("prix revenu à l'ancien montant avant l'échéance : plus rien n'est prévu", async () => {
      const { row } = await subscribe("essentiel", true);
      const before = await planOf("essentiel");
      await withNewPrice("essentiel", 4999, async () => {
        await platform((tx) => applyPriceChanges(tx, billing.gateway, NOW));
        // L'admin remet l'ancien prix (même prix Stripe).
        await owner
          .update(plans)
          .set({ priceCents: before.priceCents, stripePriceId: row.stripePriceId })
          .where(eq(plans.id, before.id));
        await platform((tx) => applyPriceChanges(tx, billing.gateway, NOW));
        const [current] = await owner.select().from(subscriptions).where(eq(subscriptions.id, row.id));
        expect(current.priceChangeAt).toBeNull();
      });
    });
  });

  describe("formule avec ou sans engagement", () => {
    it("depuis l'espace : sans engagement, frais de création payés et pas de date de fin d'engagement", async () => {
      const s = await setup("basic");
      const essentiel = await planOf("essentiel");
      const redirect = await platform((tx) =>
        requestPlanChange(tx, s.id, essentiel.id, billing.gateway, { ...urls, withCommitment: false }),
      );
      const checkoutId = (redirect as { url: string }).url.split("/").at(-1)!;
      const checkout = billing.checkouts.get(checkoutId)!;
      expect(checkout.metadata.commitment).toBe("no");
      expect(checkout.setupFee).toMatchObject({ amountCents: 14900 });
      await platform((tx) => applySubscription(tx, billing.completeCheckout(checkoutId, NOW), NOW));
      const [row] = await owner.select().from(subscriptions).where(eq(subscriptions.tenantId, s.id));
      expect(row).toMatchObject({ withCommitment: false, commitmentEndsAt: null });
    });

    it("depuis l'espace : avec engagement, création offerte et fin d'engagement dans 12 mois", async () => {
      const s = await setup("basic");
      const serenite = await planOf("serenite");
      const redirect = await platform((tx) =>
        requestPlanChange(tx, s.id, serenite.id, billing.gateway, { ...urls, withCommitment: true }),
      );
      const checkoutId = (redirect as { url: string }).url.split("/").at(-1)!;
      expect(billing.checkouts.get(checkoutId)!.setupFee).toBeNull();
      await platform((tx) => applySubscription(tx, billing.completeCheckout(checkoutId, NOW), NOW));
      const [row] = await owner.select().from(subscriptions).where(eq(subscriptions.tenantId, s.id));
      expect(row.withCommitment).toBe(true);
      expect(row.commitmentEndsAt?.toISOString()).toBe(new Date("2027-10-05T07:00:00Z").toISOString());
    });

    it("à la commande : la formule choisie fixe les frais de création ; le Basic n'a ni engagement ni frais", async () => {
      n += 1;
      const [user] = await owner
        .insert(users)
        .values({ email: `commande-${n}-${Date.now().toString(36)}@example.com`, name: "Nora" })
        .returning();
      const form = (planCode: string, withCommitment: boolean) => ({
        planCode,
        businessName: "Institut Nora",
        activity: "Esthétique",
        phone: "06 12 34 56 78",
        withCommitment,
      });
      const result = await platform((tx) =>
        createOrder(tx, user.id, form("essentiel", false), billing.gateway, () => urls),
      );
      const [order] = await owner.select().from(orders).where(eq(orders.id, result.orderId));
      expect(order.withCommitment).toBe(false);
      const checkout = billing.checkouts.get(order.stripeCheckoutSessionId!)!;
      expect(checkout.setupFee).toMatchObject({ amountCents: 14900 });
      expect(checkout.metadata.commitment).toBe("no");

      const basic = await platform((tx) =>
        createOrder(tx, user.id, form("basic", true), billing.gateway, () => urls),
      );
      const [free] = await owner.select().from(orders).where(eq(orders.id, basic.orderId));
      expect(free.withCommitment).toBe(false);
    });
  });
});
