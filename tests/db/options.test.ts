import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { orders, planOptions, plans, tenantOptions, users } from "@/db/schema";
import { handleBillingEvent } from "@/modules/billing/events";
import { listTenantOptions } from "@/modules/billing/options";
import { applySubscription, requestPlanChange } from "@/modules/billing/subscriptions";
import { setTenantOption } from "@/modules/billing/tenant-options";
import { AppError } from "@/modules/errors";
import { createOrder, linkOrderToTenant } from "@/modules/orders/orders";
import { getTenantPlan } from "@/modules/quotas";
import { loadSiteData } from "@/modules/site/data";
import { createTenant } from "@/modules/tenants/create";
import { createFakeBilling } from "../setup/fake-billing";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, pgErrorCode, type TestDb } from "../setup/db";

/** Options à la carte : commande, facturation Stripe (simulée), droits du site, activation par l'admin. */
const START = new Date("2026-10-05T08:00:00Z");
const PRICES: Record<string, number> = { booking: 1500, "online-payment": 900, "google-reviews": 500 };

describe.skipIf(!hasTestDatabase)("options à la carte", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  let closeSales: (() => Promise<unknown>) | undefined;
  const billing = createFakeBilling();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    closeSales = await openSales(owner);
    // Tarifs fixés pour ces tests (aucun tarif n'est inventé dans les valeurs de départ).
    for (const [code, priceCents] of Object.entries(PRICES))
      await owner
        .update(planOptions)
        .set({ priceCents, stripePriceId: null })
        .where(eq(planOptions.code, code));
  });

  afterAll(async () => {
    await owner
      ?.update(planOptions)
      .set({ priceCents: null, stripePriceId: null, stripeProductId: null })
      .where(inArray(planOptions.code, Object.keys(PRICES)));
    await closeSales?.();
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

  async function newUser() {
    n += 1;
    const [user] = await owner
      .insert(users)
      .values({ email: `opt-${n}-${Date.now().toString(36)}@example.com` })
      .returning();
    return user;
  }

  const form = (planCode: string, optionCodes: string[]) => ({
    planCode,
    businessName: `Garage Martin ${n}`,
    activity: "Garagiste",
    phone: "06 12 34 56 78",
    optionCodes,
  });
  const urls = () => ({ successUrl: "https://app.test/ok", cancelUrl: "https://app.test/annule" });

  /** Commande payée puis site créé : renvoie le site et son abonnement. */
  async function orderedSite(planCode: string, optionCodes: string[]) {
    const user = await newUser();
    const created = await platform((tx) =>
      createOrder(tx, user.id, form(planCode, optionCodes), billing.gateway, urls),
    );
    const [order] = await owner.select().from(orders).where(eq(orders.id, created.orderId));
    const subscription = billing.completeCheckout(order.stripeCheckoutSessionId!, START);
    await platform((tx) =>
      handleBillingEvent(
        tx,
        {
          id: `evt_opt_${n}`,
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
        slug: `garage-${n}-${Date.now().toString(36)}`,
        planCode,
        managerEmail: user.email,
      }),
    );
    await platform((tx) => linkOrderToTenant(tx, order.id, tenant.id, billing.gateway));
    return { tenant, order, subscription, checkout: billing.checkouts.get(order.stripeCheckoutSessionId!)! };
  }

  const codesOf = async (tenantId: string) =>
    (await platform((tx) => listTenantOptions(tx, tenantId))).map((row) => row.option.code);

  it("commande : les options et leurs dépendances sont facturées avec le pack, puis actives sur le site", async () => {
    const { tenant, order, checkout } = await orderedSite("business", ["online-payment"]);
    expect(order.optionCodes).toEqual(["booking", "online-payment"]);
    expect(checkout.optionPriceIds).toHaveLength(2);
    expect(await codesOf(tenant.id)).toEqual(["booking", "online-payment"]);
    // Droits du site : ceux du pack, plus ceux des options (lus avec le rôle du site).
    const plan = await withTenant(tenant.id, (tx) => getTenantPlan(tx, tenant.id), app);
    expect(plan.features).toMatchObject({ onlineBooking: true, onlinePayment: true, advancedSeo: true });
    const site = await withTenant(tenant.id, (tx) => loadSiteData(tx, tenant.id), app, null);
    expect(site?.features.customerSpace).toBe(true);
  });

  it("commande : une option sans tarif ou pas encore livrée est refusée", async () => {
    const user = await newUser();
    for (const code of ["loyalty", "shop"]) {
      expect(
        await errorCode(
          platform((tx) => createOrder(tx, user.id, form("pro", [code]), billing.gateway, urls)),
        ),
      ).toBe("option_unavailable");
    }
  });

  it("changement de pack : les options restent facturées", async () => {
    const { tenant } = await orderedSite("pro", ["booking"]);
    const [business] = await owner.select().from(plans).where(eq(plans.code, "business"));
    expect(
      (await platform((tx) => requestPlanChange(tx, tenant.id, business.id, billing.gateway, urls()))).kind,
    ).toBe("upgraded");
    expect(await codesOf(tenant.id)).toEqual(["booking"]);
  });

  it("admin : ajout et retrait d'une option sur l'abonnement Stripe, dépendances respectées", async () => {
    const { tenant, subscription } = await orderedSite("pro", []);
    expect(await codesOf(tenant.id)).toEqual([]);
    expect(
      await errorCode(
        platform((tx) =>
          setTenantOption(tx, tenant.id, { code: "online-payment", active: true }, billing.gateway),
        ),
      ),
    ).toBe("option_requires");
    await platform((tx) =>
      setTenantOption(tx, tenant.id, { code: "booking", active: true }, billing.gateway),
    );
    await platform((tx) =>
      setTenantOption(tx, tenant.id, { code: "online-payment", active: true }, billing.gateway),
    );
    expect(billing.subscriptions.get(subscription.id)!.optionItems).toHaveLength(2);
    expect(await codesOf(tenant.id)).toEqual(["booking", "online-payment"]);
    expect(
      await errorCode(
        platform((tx) => setTenantOption(tx, tenant.id, { code: "booking", active: false }, billing.gateway)),
      ),
    ).toBe("option_required_by");
    await platform((tx) =>
      setTenantOption(tx, tenant.id, { code: "online-payment", active: false }, billing.gateway),
    );
    expect(await codesOf(tenant.id)).toEqual(["booking"]);
    // Sans tarif fixé, une option ne peut pas être ajoutée à un abonnement payant.
    expect(
      await errorCode(
        platform((tx) => setTenantOption(tx, tenant.id, { code: "loyalty", active: true }, billing.gateway)),
      ),
    ).toBe("option_price_missing");

    // Fin de l'abonnement : retour au pack gratuit, les options s'arrêtent aussi.
    await platform((tx) => applySubscription(tx, billing.setStatus(subscription.id, "canceled")));
    expect(await codesOf(tenant.id)).toEqual([]);
  });

  it("une option offerte à la main reste active quand Stripe resynchronise l'abonnement", async () => {
    const { tenant, subscription } = await orderedSite("pro", []);
    // Option offerte avant l'abonnement : enregistrée sans ligne d'abonnement (aucun prélèvement).
    const [option] = await owner.select().from(planOptions).where(eq(planOptions.code, "booking"));
    await owner.insert(tenantOptions).values({ tenantId: tenant.id, optionId: option.id });
    expect(await codesOf(tenant.id)).toEqual(["booking"]);
    await platform((tx) => applySubscription(tx, billing.setStatus(subscription.id, "active")));
    expect(await codesOf(tenant.id)).toEqual(["booking"]);
  });

  it("admin : sans abonnement, option offerte activée à la main ; la gérante ne peut pas l'écrire", async () => {
    n += 1;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: "Atelier offert",
        slug: `offert-${n}-${Date.now().toString(36)}`,
        planCode: "pro",
        managerEmail: `offert-${n}@example.com`,
      }),
    );
    await platform((tx) => setTenantOption(tx, tenant.id, { code: "loyalty", active: false }, null));
    await platform((tx) => setTenantOption(tx, tenant.id, { code: "booking", active: true }, null));
    expect(await codesOf(tenant.id)).toEqual(["booking"]);
    const [option] = await owner.select().from(planOptions).where(eq(planOptions.code, "google-reviews"));
    expect(
      await pgErrorCode(
        withTenant(
          tenant.id,
          (tx) => tx.insert(tenantOptions).values({ tenantId: tenant.id, optionId: option.id }),
          app,
        ),
      ),
    ).toBe("42501");
  });
});
