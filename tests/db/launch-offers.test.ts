import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@/db/access";
import type { Transaction } from "@/db/client";
import { launchOffers, messageLog, orders, plans, users } from "@/db/schema";
import { listClaims, listLaunchOffers, setClaimStatus } from "@/modules/billing/launch-offers";
import { addQuotaCredit, consumeQuota, quotaStatus } from "@/modules/billing/usage";
import { AppError } from "@/modules/errors";
import { createOrder, markOrderPaid, rejectOrder } from "@/modules/orders/orders";
import { assertQuota } from "@/modules/quotas";
import { createTenant } from "@/modules/tenants/create";
import { createFakeBilling } from "../setup/fake-billing";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Offre tablette (places réelles), quotas mensuels des outils, limite de contacts du Basic. */
describe.skipIf(!hasTestDatabase)("offre de lancement et quotas", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  let closeSales: (() => Promise<unknown>) | undefined;
  let offerId: string;
  let quotaBefore: number;
  const billing = createFakeBilling();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    closeSales = await openSales(owner);
    const [offer] = await owner.select().from(launchOffers);
    offerId = offer.id;
    quotaBefore = offer.quota;
  });

  afterAll(async () => {
    await owner
      ?.update(launchOffers)
      .set({ quota: quotaBefore, isActive: true })
      .where(eq(launchOffers.id, offerId));
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

  async function order(planCode: string, withCommitment: boolean) {
    n += 1;
    const [user] = await owner
      .insert(users)
      .values({ email: `tablette-${n}-${Date.now().toString(36)}@example.com` })
      .returning();
    const result = await platform((tx) =>
      createOrder(
        tx,
        user.id,
        {
          planCode,
          businessName: `Coach ${n}`,
          activity: "Coach sportif",
          phone: "0612345678",
          withCommitment,
        },
        billing.gateway,
        urls,
      ),
    );
    return result.orderId;
  }

  const offer = async () =>
    (await platform((tx) => listLaunchOffers(tx))).find((item) => item.id === offerId)!;

  it("retient une place pour le Business avec engagement seulement, et compte les places réellement prises", async () => {
    await owner.update(launchOffers).set({ quota: 2, isActive: true }).where(eq(launchOffers.id, offerId));
    const start = (await offer()).taken;
    await owner
      .update(launchOffers)
      .set({ quota: start + 2 })
      .where(eq(launchOffers.id, offerId));

    await order("business", false);
    await order("pro", true);
    expect((await offer()).taken).toBe(start);

    const first = await order("business", true);
    expect((await offer()).remaining).toBe(1);
    const second = await order("business", true);
    expect(await offer()).toMatchObject({ remaining: 0, open: false });
    // Offre complète : une nouvelle commande Business ne retient plus de place.
    await order("business", true);
    expect((await offer()).taken).toBe(start + 2);

    // Premier paiement : place confirmée, éligibilité à vérifier ; refus : place libérée.
    const [paid] = await owner.select().from(orders).where(eq(orders.id, first));
    await platform((tx) =>
      markOrderPaid(tx, { orderId: paid.id, subscriptionId: `sub_tab_${n}`, customerId: null }),
    );
    const claims = await platform((tx) => listClaims(tx, offerId));
    const claim = claims.find((row) => row.claim.orderId === first)!.claim;
    expect(claim.status).toBe("pending_review");
    expect(await errorCode(platform((tx) => setClaimStatus(tx, claim.id, "shipped")))).toBe("invalid");
    await platform((tx) => setClaimStatus(tx, claim.id, "eligible"));
    await platform((tx) => setClaimStatus(tx, claim.id, "shipped"));

    await platform((tx) =>
      markOrderPaid(tx, { orderId: second, subscriptionId: `sub_tab2_${n}`, customerId: null }),
    );
    // Abonnement simulé sans Stripe : rien à arrêter chez Stripe au refus.
    await owner.update(orders).set({ stripeSubscriptionId: null }).where(eq(orders.id, second));
    await platform((tx) => rejectOrder(tx, second, "Hors zone de livraison", billing.gateway));
    expect(await offer()).toMatchObject({ remaining: 1, open: true });
  });

  it("quotas mensuels : non inclus, consommation, alerte, pause à la limite, recharge volontaire", async () => {
    n += 1;
    const tenant = async (planCode: string) =>
      (
        await platform((tx) =>
          createTenant(tx, {
            name: `Quota ${n}`,
            slug: `quota-${planCode}-${n}-${Date.now().toString(36)}`,
            planCode,
            managerEmail: `quota-${planCode}-${n}@example.com`,
          }),
        )
      ).tenant;
    const pro = await tenant("pro");
    expect(await errorCode(platform((tx) => consumeQuota(tx, pro.id, "aiImages")))).toBe(
      "feature_unavailable",
    );

    const business = await tenant("business");
    const now = new Date("2026-10-20T10:00:00Z");
    await platform((tx) => consumeQuota(tx, business.id, "aiImages", 15, now));
    await platform((tx) => consumeQuota(tx, business.id, "aiImages", 1, now));
    const alerts = await owner.select().from(messageLog).where(eq(messageLog.tenantId, business.id));
    expect(alerts.map((row) => row.templateKey)).toEqual(["manager.usage_quota"]);
    await platform((tx) => consumeQuota(tx, business.id, "aiImages", 4, now));
    expect(await errorCode(platform((tx) => consumeQuota(tx, business.id, "aiImages", 1, now)))).toBe(
      "quota_reached",
    );
    await platform((tx) => addQuotaCredit(tx, business.id, "aiImages", 10, now));
    expect((await platform((tx) => quotaStatus(tx, business.id, "aiImages", now))).remaining).toBe(10);
    // Le mois suivant, le compteur repart à zéro (sans la recharge du mois passé).
    const next = new Date("2026-11-03T10:00:00Z");
    expect(await platform((tx) => quotaStatus(tx, business.id, "aiImages", next))).toMatchObject({
      used: 0,
      remaining: 20,
    });
  });

  it("Basic : 50 contacts clients au plus", async () => {
    n += 1;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: `Contacts ${n}`,
        slug: `contacts-${n}-${Date.now().toString(36)}`,
        planCode: "basic",
        managerEmail: `contacts-${n}@example.com`,
      }),
    );
    const [basic] = await owner.select().from(plans).where(eq(plans.code, "basic"));
    expect(basic.limits.customers).toBe(50);
    await owner.execute(
      `INSERT INTO customers (tenant_id, business_id, first_name, email)
       SELECT '${tenant.id}', b.id, 'Client', 'client' || g || '-${n}@example.com'
       FROM businesses b, generate_series(1, 50) g WHERE b.tenant_id = '${tenant.id}'` as never,
    );
    expect(await errorCode(platform((tx) => assertQuota(tx, tenant.id, "customers")))).toBe("quota_reached");
  });
});
