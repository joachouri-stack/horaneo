import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { orders, plans, referrals, subscriptions, tenants, users } from "@/db/schema";
import { handleBillingEvent } from "@/modules/billing/events";
import { markReferralGranted, referralOverview } from "@/modules/billing/referrals";
import { withVatCents } from "@/modules/billing/vat";
import { createOrder, rejectOrder } from "@/modules/orders/orders";
import { getPlatformSetting, setPlatformSetting } from "@/modules/settings";
import { createTenant } from "@/modules/tenants/create";
import { createFakeBilling } from "../setup/fake-billing";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, withLegacyCatalog, type TestDb } from "../setup/db";

/** Parrainage : lien d'une cliente, commande parrainée, mois offert au premier vrai paiement. */
const START = new Date("2026-10-05T08:00:00Z");
const urls = (orderId: string) => ({
  successUrl: `https://app.test/commander/merci?commande=${orderId}`,
  cancelUrl: "https://app.test/commander",
});

describe.skipIf(!hasTestDatabase)("parrainage", () => {
  let owner: TestDb;
  let app: TestDb;
  let restoreCatalog: (() => Promise<void>) | undefined;
  let closeSales: (() => Promise<unknown>) | undefined;
  let n = 0;
  const run = Date.now().toString(36);
  const billing = createFakeBilling();

  beforeAll(async () => {
    owner = await openTestDb();
    restoreCatalog = await withLegacyCatalog(owner, { freeOnSale: true });
    app = openAppDb();
    closeSales = await openSales(owner);
  });

  afterAll(async () => {
    await restoreCatalog?.();
    await closeSales?.();
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function newUser() {
    n += 1;
    const [user] = await owner
      .insert(users)
      .values({ email: `parrainage-${n}-${run}@example.com` })
      .returning();
    return user;
  }

  /** Marraine : site en ligne, avec (ou sans) abonnement Stripe en cours. */
  async function sponsor({ stripe = true } = {}) {
    const user = await newUser();
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: `Marraine ${n}`,
        slug: `marraine-${n}-${run}`,
        planCode: "serenite",
        managerEmail: user.email,
      }),
    );
    await owner.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenant.id));
    if (stripe) {
      const [plan] = await owner.select().from(plans).where(eq(plans.code, "serenite"));
      await owner
        .insert(subscriptions)
        .values({
          tenantId: tenant.id,
          planId: plan.id,
          stripeCustomerId: `cus_${n}_${run}`,
          status: "active",
        })
        .onConflictDoUpdate({
          target: subscriptions.tenantId,
          set: { planId: plan.id, stripeCustomerId: `cus_${n}_${run}`, status: "active" },
        });
    }
    return tenant;
  }

  /** Nouvelle cliente : commande par le lien, puis paiement sur la page Stripe (essai). */
  async function referredOrder(code: string | undefined) {
    const user = await newUser();
    const created = await platform((tx) =>
      createOrder(
        tx,
        user.id,
        {
          planCode: "essentiel",
          businessName: `Filleule ${n}`,
          activity: "Coiffure",
          phone: "06 12 34 56 78",
          referralCode: code,
        },
        billing.gateway,
        urls,
      ),
    );
    const [order] = await owner.select().from(orders).where(eq(orders.id, created.orderId));
    const subscription = billing.completeCheckout(order.stripeCheckoutSessionId!, START);
    await platform((tx) =>
      handleBillingEvent(
        tx,
        {
          id: `evt_ref_checkout_${n}_${run}`,
          type: "checkout.session.completed",
          raw: {},
          kind: "checkout_completed",
          subscriptionId: subscription.id,
        },
        billing.gateway,
      ),
    );
    return { order, subscription };
  }

  const invoicePaid = (subscriptionId: string, amountPaidCents: number, tag: string) =>
    platform((tx) =>
      handleBillingEvent(
        tx,
        {
          id: `evt_ref_invoice_${tag}_${run}`,
          type: "invoice.paid",
          raw: {},
          kind: "invoice_paid",
          subscriptionId,
          amountPaidCents,
        },
        billing.gateway,
      ),
    );

  const referralOf = async (orderId: string) =>
    (await owner.select().from(referrals).where(eq(referrals.orderId, orderId)))[0];

  it("un mois du pack de la marraine est crédité au premier vrai paiement de la filleule, une seule fois", async () => {
    const marraine = await sponsor();
    // Essai gratuit à la commande (sans essai dans les autres tests de la base).
    await platform((tx) => setPlatformSetting(tx, "trial_days", 14));
    const { order, subscription } = await referredOrder(marraine.slug).finally(() =>
      platform((tx) => setPlatformSetting(tx, "trial_days", 0)),
    );
    expect(subscription.status).toBe("trialing");
    const creditsBefore = billing.credits.length;
    expect(order.referrerTenantId).toBe(marraine.id);
    expect(await referralOf(order.id)).toMatchObject({ tenantId: marraine.id, status: "pending" });

    // Facture de l'essai (0 €) : rien. Paiement pendant l'essai (frais de création) : rien non plus.
    await invoicePaid(subscription.id, 0, "trial");
    await invoicePaid(subscription.id, 9900, "setup");
    expect((await referralOf(order.id)).status).toBe("pending");
    expect(billing.credits).toHaveLength(creditsBefore);

    // Fin de l'essai : premier prélèvement du mois.
    billing.renew(subscription.id);
    expect(await invoicePaid(subscription.id, 4500, "first")).toMatchObject({ detail: "referral_rewarded" });
    const [plan] = await owner.select().from(plans).where(eq(plans.code, "serenite"));
    const expected = await platform(async (tx) =>
      (await getPlatformSetting(tx, "prices_display")) === "HT"
        ? withVatCents(plan.priceCents, Number(await getPlatformSetting(tx, "vat_rate_percent")))
        : plan.priceCents,
    );
    const rewarded = await referralOf(order.id);
    expect(rewarded).toMatchObject({ status: "rewarded", rewardMonths: 1, creditCents: expected });
    const credits = billing.credits.filter((credit) => credit.idempotencyKey === `referral:${rewarded.id}`);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ amountCents: expected, description: "Parrainage : 1 mois offert" });

    // Mois suivant : pas de second crédit.
    billing.renew(subscription.id);
    await invoicePaid(subscription.id, 4500, "second");
    expect(
      billing.credits.filter((credit) => credit.idempotencyKey === `referral:${rewarded.id}`),
    ).toHaveLength(1);

    // La marraine voit son parrainage dans son espace (lecture limitée à ses lignes).
    const overview = await withTenant(marraine.id, (tx) => referralOverview(tx, marraine.id), app);
    expect(overview).toMatchObject({
      code: marraine.slug,
      active: true,
      pending: 0,
      rewarded: 1,
      monthsEarned: 1,
    });
  });

  it("code inconnu ou site hors ligne : la commande n'est pas parrainée", async () => {
    const { order } = await referredOrder("aucun-site-de-ce-nom");
    expect(order.referrerTenantId).toBeNull();
    expect(await referralOf(order.id)).toBeUndefined();
    const draft = await sponsor();
    await owner.update(tenants).set({ status: "draft" }).where(eq(tenants.id, draft.id));
    const second = await referredOrder(draft.slug);
    expect(second.order.referrerTenantId).toBeNull();
  });

  it("marraine sans abonnement Stripe : à accorder à la main, puis marqué accordé par l'équipe", async () => {
    const marraine = await sponsor({ stripe: false });
    const { order, subscription } = await referredOrder(marraine.slug);
    billing.renew(subscription.id);
    expect(await invoicePaid(subscription.id, 4500, "manual")).toMatchObject({ detail: "referral_manual" });
    const referral = await referralOf(order.id);
    expect(referral.status).toBe("manual");
    await platform((tx) => markReferralGranted(tx, referral.id));
    expect((await referralOf(order.id)).status).toBe("rewarded");
  });

  it("commande refusée : le parrainage est annulé", async () => {
    const marraine = await sponsor();
    const { order } = await referredOrder(marraine.slug);
    await platform((tx) => rejectOrder(tx, order.id, "Hors cible", billing.gateway));
    expect((await referralOf(order.id)).status).toBe("cancelled");
  });

  it("parrainage désactivé (0 mois) : le lien n'a pas d'effet", async () => {
    const marraine = await sponsor();
    await platform((tx) => setPlatformSetting(tx, "referral_reward_months", 0));
    try {
      const { order } = await referredOrder(marraine.slug);
      expect(order.referrerTenantId).toBeNull();
      expect(await referralOf(order.id)).toBeUndefined();
    } finally {
      await platform((tx) => setPlatformSetting(tx, "referral_reward_months", 1));
    }
  });
});
