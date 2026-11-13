import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { orders, plans, users } from "@/db/schema";
import { handleBillingEvent } from "@/modules/billing/events";
import { requestPlanChange } from "@/modules/billing/subscriptions";
import { saveService } from "@/modules/catalog/services";
import { saveTestimonial } from "@/modules/content/testimonials";
import { AppError } from "@/modules/errors";
import { dataExportAllowed } from "@/modules/export/business-data";
import { updateGiftCardSettings } from "@/modules/giftcards/giftcards";
import { createOrder, linkOrderToTenant } from "@/modules/orders/orders";
import { savePromoCode } from "@/modules/promo/codes";
import { savePromotion } from "@/modules/promotions/promotions";
import { getTenantPlan } from "@/modules/quotas";
import { updateStatsGoals } from "@/modules/stats/goals";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { createFakeBilling } from "../setup/fake-billing";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Packs Starter, Pro, Business : un site Starter n'a aucune fonction des packs supérieurs
 * (refusée côté serveur, pas seulement masquée), et passe au pack supérieur sans perdre ses données.
 */
const START = new Date("2026-10-05T08:00:00Z");

describe.skipIf(!hasTestDatabase)("packs : fonctions réservées et passage au pack supérieur", () => {
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
  const site = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) => withTenant(tenantId, fn, app);
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

  /** Commande payée (paiement simulé) puis site créé, comme pour une vraie cliente. */
  async function orderedSite(planCode: string) {
    n += 1;
    const [user] = await owner
      .insert(users)
      .values({ email: `pack-${n}-${Date.now().toString(36)}@example.com` })
      .returning();
    const created = await platform((tx) =>
      createOrder(
        tx,
        user.id,
        {
          planCode,
          businessName: `Atelier ${n}`,
          activity: "Coiffure",
          phone: "06 12 34 56 78",
          optionCodes: [],
          acceptTerms: true,
        } as never,
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
          id: `evt_pack_${n}`,
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
        slug: `atelier-${n}-${Date.now().toString(36)}`,
        planCode,
        managerEmail: user.email,
      }),
    );
    await platform((tx) => linkOrderToTenant(tx, order.id, tenant.id, billing.gateway));
    const service = await platform((tx) =>
      saveService(tx, tenant.id, { name: "Coupe", durationMinutes: 30, price: "25" }),
    );
    return { ...tenant, serviceId: service.id };
  }

  const planId = async (code: string) =>
    (await owner.select({ id: plans.id }).from(plans).where(eq(plans.code, code)))[0].id;

  /** Fonctions des packs Pro et Business, essayées avec le rôle du site (comme dans l'espace). */
  const proOnly = (tenantId: string, serviceId: string) => ({
    promoCode: () =>
      site(tenantId, (tx) =>
        savePromoCode(tx, tenantId, { code: `BIENVENUE${n}`, discountType: "percent", discountValue: "10" }),
      ),
    promotion: () =>
      site(tenantId, (tx) =>
        savePromotion(tx, tenantId, {
          title: "Offre",
          serviceIds: [serviceId],
          discountType: "percent",
          discountValue: "10",
          startsOn: "2026-10-05",
          endsOn: "2026-10-20",
        }),
      ),
    testimonial: () =>
      site(tenantId, (tx) =>
        saveTestimonial(tx, tenantId, { authorName: "Camille", text: "Super", rating: 5 }),
      ),
    giftCards: () =>
      site(tenantId, (tx) =>
        updateGiftCardSettings(tx, tenantId, {
          enabled: true,
          validityMonths: 12,
          amounts: "30, 50",
          min: "20",
          max: "200",
        }),
      ),
    stats: () =>
      site(tenantId, (tx) =>
        updateStatsGoals(tx, tenantId, { revenue: "3000", appointments: "", newCustomers: "" }),
      ),
  });

  it("Starter : aucune fonction des packs Pro et Business, 2 membres au plus", async () => {
    const tenant = await orderedSite("starter");
    const plan = await site(tenant.id, (tx) => getTenantPlan(tx, tenant.id));
    expect(plan.code).toBe("starter");
    for (const [name, attempt] of Object.entries(proOnly(tenant.id, tenant.serviceId)))
      expect(await errorCode(attempt()), name).toBe("feature_unavailable");
    expect(await site(tenant.id, (tx) => dataExportAllowed(tx, tenant.id, plan.features))).toBe(false);
    // Deux membres (la gérante et un collaborateur), pas un troisième.
    await site(tenant.id, (tx) => saveStaff(tx, tenant.id, { name: "Léa", serviceIds: [] }));
    await site(tenant.id, (tx) => saveStaff(tx, tenant.id, { name: "Inès", serviceIds: [] }));
    expect(
      await errorCode(site(tenant.id, (tx) => saveStaff(tx, tenant.id, { name: "Zoé", serviceIds: [] }))),
    ).toBe("quota_reached");
  });

  it("Starter → Pro tout de suite (fonctions ouvertes), Pro → Business, puis retour au Starter en fin de période", async () => {
    const tenant = await orderedSite("starter");
    expect(
      (
        await platform(async (tx) =>
          requestPlanChange(tx, tenant.id, await planId("pro"), billing.gateway, urls()),
        )
      ).kind,
    ).toBe("upgraded");
    const pro = await site(tenant.id, (tx) => getTenantPlan(tx, tenant.id));
    expect(pro.code).toBe("pro");
    for (const [name, attempt] of Object.entries(proOnly(tenant.id, tenant.serviceId)))
      expect(await errorCode(attempt()), name).toBeUndefined();
    expect(pro.limits.members).toBe(3);

    expect(
      (
        await platform(async (tx) =>
          requestPlanChange(tx, tenant.id, await planId("business"), billing.gateway, urls()),
        )
      ).kind,
    ).toBe("upgraded");
    expect((await site(tenant.id, (tx) => getTenantPlan(tx, tenant.id))).code).toBe("business");

    // Vers un pack inférieur : à la fin de la période payée, le pack reste Business d'ici là.
    expect(
      (
        await platform(async (tx) =>
          requestPlanChange(tx, tenant.id, await planId("starter"), billing.gateway, urls()),
        )
      ).kind,
    ).toBe("downgrade_scheduled");
    expect((await site(tenant.id, (tx) => getTenantPlan(tx, tenant.id))).code).toBe("business");
  });
});
