import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@/db/access";
import type { Transaction } from "@/db/client";
import { orders, planOptions, plans, subscriptions, users } from "@/db/schema";
import { handleBillingEvent } from "@/modules/billing/events";
import { requestPlanChange } from "@/modules/billing/subscriptions";
import { AppError } from "@/modules/errors";
import { createOrder, linkOrderToTenant } from "@/modules/orders/orders";
import { createTenant } from "@/modules/tenants/create";
import { createFakeBilling } from "../setup/fake-billing";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Paiement à l'année : prix Stripe annuel (mois offerts), abonnement suivi, changement de pack. */
const START = new Date("2026-10-05T08:00:00Z");

describe.skipIf(!hasTestDatabase)("facturation à l'année", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  let closeSales: (() => Promise<unknown>) | undefined;
  const billing = createFakeBilling();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    closeSales = await openSales(owner);
  });

  afterAll(async () => {
    await closeSales?.();
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  const urls = () => ({ successUrl: "https://app.test/ok", cancelUrl: "https://app.test/annule" });

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  async function newUser() {
    n += 1;
    const [user] = await owner
      .insert(users)
      .values({ email: `annuel-${n}-${Date.now().toString(36)}@example.com` })
      .returning();
    return user;
  }

  const form = (planCode: string, billingInterval: "month" | "year", optionCodes: string[] = []) => ({
    planCode,
    businessName: `Garage Annuel ${n}`,
    activity: "Garagiste",
    phone: "06 12 34 56 78",
    withCommitment: false,
    billingInterval,
    optionCodes,
  });

  async function planOf(code: string) {
    const [plan] = await owner.select().from(plans).where(eq(plans.code, code));
    return plan;
  }

  it("commande à l'année : prix annuel avec les mois offerts, période de 12 mois, engagement", async () => {
    const user = await newUser();
    const created = await platform((tx) =>
      createOrder(tx, user.id, form("pro", "year"), billing.gateway, urls),
    );
    const [order] = await owner.select().from(orders).where(eq(orders.id, created.orderId));
    expect(order).toMatchObject({ billingInterval: "year", withCommitment: true });
    const checkout = billing.checkouts.get(order.stripeCheckoutSessionId!)!;
    const pro = await planOf("pro");
    // 2 mois offerts (réglage de départ) : 10 mois payés.
    expect(billing.prices.get(checkout.priceId)).toMatchObject({
      interval: "year",
      amountCents: pro.priceCents * 10,
    });
    expect(checkout.metadata.interval).toBe("year");
    expect(pro.stripeYearlyPriceCents).toBe(pro.priceCents * 10);

    const subscription = billing.completeCheckout(order.stripeCheckoutSessionId!, START);
    expect(subscription.currentPeriodEnd?.toISOString()).toBe("2027-10-05T08:00:00.000Z");
    await platform((tx) =>
      handleBillingEvent(
        tx,
        {
          id: `evt_year_${n}`,
          type: "checkout.session.completed",
          raw: {},
          kind: "checkout_completed",
          subscriptionId: subscription.id,
        },
        billing.gateway,
      ),
    );
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: order.businessName,
        slug: `annuel-${n}-${Date.now().toString(36)}`,
        planCode: "pro",
        managerEmail: user.email,
      }),
    );
    await platform((tx) => linkOrderToTenant(tx, order.id, tenant.id, billing.gateway));
    const [row] = await owner.select().from(subscriptions).where(eq(subscriptions.tenantId, tenant.id));
    expect(row).toMatchObject({ billingInterval: "year", withCommitment: true });

    // Pack supérieur : même périodicité (prix annuel du Business).
    const business = await planOf("business");
    expect(
      (await platform((tx) => requestPlanChange(tx, tenant.id, business.id, billing.gateway, urls()))).kind,
    ).toBe("upgraded");
    const remote = billing.subscriptions.get(subscription.id)!;
    expect(billing.prices.get(remote.priceId!)).toMatchObject({
      interval: "year",
      amountCents: business.priceCents * 10,
    });
  });

  it("le prix annuel suit la réduction réglée ; pas d'option à l'année", async () => {
    await owner.execute(
      `UPDATE platform_settings SET value = '1'::jsonb WHERE key = 'yearly_free_months'` as never,
    );
    try {
      const user = await newUser();
      const created = await platform((tx) =>
        createOrder(tx, user.id, form("business", "year"), billing.gateway, urls),
      );
      const [order] = await owner.select().from(orders).where(eq(orders.id, created.orderId));
      const checkout = billing.checkouts.get(order.stripeCheckoutSessionId!)!;
      const business = await planOf("business");
      expect(billing.prices.get(checkout.priceId)?.amountCents).toBe(business.priceCents * 11);
    } finally {
      await owner.execute(
        `UPDATE platform_settings SET value = '2'::jsonb WHERE key = 'yearly_free_months'` as never,
      );
    }

    const [option] = await owner.select().from(planOptions).where(eq(planOptions.code, "booking"));
    await owner.update(planOptions).set({ priceCents: 1500 }).where(eq(planOptions.id, option.id));
    try {
      const user = await newUser();
      expect(
        await errorCode(
          platform((tx) => createOrder(tx, user.id, form("pro", "year", ["booking"]), billing.gateway, urls)),
        ),
      ).toBe("option_monthly_only");
    } finally {
      await owner
        .update(planOptions)
        .set({ priceCents: null, stripePriceId: null, stripeProductId: null })
        .where(eq(planOptions.id, option.id));
    }
  });

  it("paiement à l'année désactivé : refusé", async () => {
    await owner.execute(
      `UPDATE platform_settings SET value = 'false'::jsonb WHERE key = 'yearly_billing_enabled'` as never,
    );
    try {
      const user = await newUser();
      expect(
        await errorCode(
          platform((tx) => createOrder(tx, user.id, form("pro", "year"), billing.gateway, urls)),
        ),
      ).toBe("invalid");
    } finally {
      await owner.execute(
        `UPDATE platform_settings SET value = 'true'::jsonb WHERE key = 'yearly_billing_enabled'` as never,
      );
    }
  });
});
