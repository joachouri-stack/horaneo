import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { messageLog, plans, subscriptions, tenants } from "@/db/schema";
import { handleBillingEvent, type BillingEvent } from "@/modules/billing/events";
import type { BillingSubscription } from "@/modules/billing/gateway";
import { ensurePlanPrice, openBillingPortal, requestPlanChange } from "@/modules/billing/subscriptions";
import { AppError } from "@/modules/errors";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeBilling } from "../setup/fake-billing";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Abonnements Stripe Billing (simulé) : souscription, changements de pack, impayés. */
const START = new Date("2026-10-05T08:00:00Z");
const urls = { successUrl: "https://app.test/ok", cancelUrl: "https://app.test/annule" };

describe.skipIf(!hasTestDatabase)("abonnements", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  let eventCounter = 0;
  const billing = createFakeBilling();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
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

  async function planId(code: string) {
    const [plan] = await owner.select().from(plans).where(eq(plans.code, code));
    return plan.id;
  }

  async function setup(planCode = "basic") {
    n += 1;
    const slug = `abo-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: `Studio ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    await platform((tx) => changeStatus(tx, tenant.id, "activate"));
    return tenant.id;
  }

  async function tenantPlan(tenantId: string) {
    const [row] = await owner
      .select({ code: plans.code })
      .from(tenants)
      .innerJoin(plans, eq(plans.id, tenants.planId))
      .where(eq(tenants.id, tenantId));
    return row.code;
  }

  async function subscriptionOf(tenantId: string) {
    const [row] = await owner.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
    return row;
  }

  type EventBody = BillingEvent extends infer E
    ? E extends unknown
      ? Omit<E, "id" | "type" | "raw">
      : never
    : never;
  const send = (event: EventBody & { type?: string }) => {
    const id = `evt_billing_${(eventCounter += 1)}_${Date.now()}`;
    const full = { id, type: event.type ?? event.kind, raw: { id }, ...event } as BillingEvent;
    return platform((tx) => handleBillingEvent(tx, full, billing.gateway)).then((result) => ({
      id,
      result,
      full,
    }));
  };

  const subscriptionEvent = (subscription: BillingSubscription) =>
    send({ kind: "subscription", subscription, type: "customer.subscription.updated" });

  /** Souscription complète à un pack payant depuis le Basic. */
  async function subscribe(tenantId: string, code: string) {
    const target = await planId(code);
    const redirect = await platform((tx) => requestPlanChange(tx, tenantId, target, billing.gateway, urls));
    if (redirect.kind !== "redirect") throw new Error("Paiement attendu");
    const checkoutId = redirect.url.split("/").at(-1)!;
    const subscription = billing.completeCheckout(checkoutId, START);
    await send({
      kind: "checkout_completed",
      subscriptionId: subscription.id,
      type: "checkout.session.completed",
    });
    return subscription.id;
  }

  it("souscription depuis le Basic : page de paiement Stripe, puis pack actif et engagement de 12 mois", async () => {
    const tenantId = await setup();
    const essentiel = await planId("essentiel");
    const redirect = await platform((tx) =>
      requestPlanChange(tx, tenantId, essentiel, billing.gateway, urls),
    );
    expect(redirect.kind).toBe("redirect");
    const checkoutId = (redirect as { url: string }).url.split("/").at(-1)!;
    const checkout = billing.checkouts.get(checkoutId)!;
    expect(checkout.metadata).toEqual({ tenant_id: tenantId, plan_id: essentiel });
    expect(checkout.setupFee).toBeNull();
    // TVA à 20 %, comprise dans le prix affiché (TTC).
    expect(billing.taxRates.find((rate) => rate.id === checkout.taxRateId)).toMatchObject({
      percent: 20,
      inclusive: true,
    });
    // Le pack reste Basic tant que le paiement n'est pas fait.
    expect(await tenantPlan(tenantId)).toBe("basic");

    const subscription = billing.completeCheckout(checkoutId, START);
    const { full, result } = await send({ kind: "checkout_completed", subscriptionId: subscription.id });
    expect(result).toMatchObject({ outcome: "processed", detail: "activated" });
    expect(await tenantPlan(tenantId)).toBe("essentiel");
    const row = await subscriptionOf(tenantId);
    expect(row).toMatchObject({ status: "active", stripeSubscriptionId: subscription.id });
    expect(row.commitmentEndsAt?.toISOString()).toBe("2027-10-05T08:00:00.000Z");
    // Le même événement reçu deux fois n'est traité qu'une fois.
    expect(await platform((tx) => handleBillingEvent(tx, full, billing.gateway))).toEqual({
      outcome: "duplicate",
    });
  });

  it("un seul prix Stripe par pack, créé à la première souscription", async () => {
    const id = await planId("serenite");
    const first = await platform((tx) => ensurePlanPrice(tx, id, billing.gateway));
    const again = await platform((tx) => ensurePlanPrice(tx, id, billing.gateway));
    expect(again).toBe(first);
    expect(billing.prices.get(first)?.metadata.plan_id).toBe(id);
    expect(
      await errorCode(platform(async (tx) => ensurePlanPrice(tx, await planId("basic"), billing.gateway))),
    ).toBe("invalid");
  });

  it("pack supérieur : immédiat ; pack inférieur : à la fin de la période", async () => {
    const tenantId = await setup();
    const subscriptionId = await subscribe(tenantId, "essentiel");
    const up = await platform(async (tx) =>
      requestPlanChange(tx, tenantId, await planId("serenite"), billing.gateway, urls),
    );
    expect(up.kind).toBe("upgraded");
    expect(await tenantPlan(tenantId)).toBe("serenite");

    const down = await platform(async (tx) =>
      requestPlanChange(tx, tenantId, await planId("essentiel"), billing.gateway, urls),
    );
    expect(down.kind).toBe("downgrade_scheduled");
    expect(await tenantPlan(tenantId)).toBe("serenite");
    expect((await subscriptionOf(tenantId)).scheduledPlanId).toBe(await planId("essentiel"));

    // Fin de la période : Stripe applique le pack inférieur.
    await subscriptionEvent(billing.renew(subscriptionId));
    expect(await tenantPlan(tenantId)).toBe("essentiel");
    expect((await subscriptionOf(tenantId)).scheduledPlanId).toBeNull();
  });

  it("passage au Basic pendant l'engagement : effectif à la fin des 12 mois, annulable", async () => {
    const tenantId = await setup();
    const subscriptionId = await subscribe(tenantId, "essentiel");
    const basic = await planId("basic");
    expect((await platform((tx) => requestPlanChange(tx, tenantId, basic, billing.gateway, urls))).kind).toBe(
      "cancel_scheduled",
    );
    const row = await subscriptionOf(tenantId);
    expect(row.cancelAt?.toISOString()).toBe("2027-10-05T08:00:00.000Z");
    expect(billing.subscriptions.get(subscriptionId)?.cancelAt?.toISOString()).toBe(
      "2027-10-05T08:00:00.000Z",
    );
    expect(await tenantPlan(tenantId)).toBe("essentiel");

    // Elle change d'avis : on garde le pack actuel.
    expect(
      (
        await platform(async (tx) =>
          requestPlanChange(tx, tenantId, await planId("essentiel"), billing.gateway, urls),
        )
      ).kind,
    ).toBe("kept");
    expect(billing.subscriptions.get(subscriptionId)?.cancelAt).toBeNull();
    expect((await subscriptionOf(tenantId)).cancelAt).toBeNull();

    // Nouvelle demande, puis fin de l'abonnement chez Stripe : retour au Basic, gérante prévenue.
    await platform((tx) => requestPlanChange(tx, tenantId, basic, billing.gateway, urls));
    await send({ kind: "subscription", subscription: billing.setStatus(subscriptionId, "canceled") });
    expect(await tenantPlan(tenantId)).toBe("basic");
    const messages = await owner.select().from(messageLog).where(eq(messageLog.tenantId, tenantId));
    expect(messages.find((m) => m.templateKey === "manager.subscription_ended")?.data).toEqual({
      reason: "requested",
    });
  });

  it("un pack inférieur programmé est remplacé par une demande de passage au Basic", async () => {
    const tenantId = await setup();
    const subscriptionId = await subscribe(tenantId, "serenite");
    await platform(async (tx) =>
      requestPlanChange(tx, tenantId, await planId("essentiel"), billing.gateway, urls),
    );
    expect(billing.pendingPriceOf(subscriptionId)).not.toBeNull();
    await platform(async (tx) =>
      requestPlanChange(tx, tenantId, await planId("basic"), billing.gateway, urls),
    );
    expect(billing.pendingPriceOf(subscriptionId)).toBeNull();
    expect(await subscriptionOf(tenantId)).toMatchObject({ scheduledPlanId: null });
    expect((await subscriptionOf(tenantId)).cancelAt).not.toBeNull();
  });

  it("prélèvement refusé : gérante prévenue ; réussi ensuite : alerte effacée ; impayé définitif : retour au Basic", async () => {
    const tenantId = await setup();
    const subscriptionId = await subscribe(tenantId, "essentiel");
    await send({
      kind: "invoice_failed",
      subscriptionId,
      invoiceId: "in_1",
      attempt: 1,
      error: "Carte expirée",
    });
    let row = await subscriptionOf(tenantId);
    expect(row).toMatchObject({ status: "past_due", lastPaymentError: "Carte expirée" });
    expect(row.paymentFailedAt).not.toBeNull();
    // Le pack payant reste actif pendant les nouvelles tentatives.
    expect(await tenantPlan(tenantId)).toBe("essentiel");
    await send({ kind: "invoice_paid", subscriptionId });
    row = await subscriptionOf(tenantId);
    expect(row.paymentFailedAt).toBeNull();

    await send({ kind: "invoice_failed", subscriptionId, invoiceId: "in_2", attempt: 4, error: null });
    await send({ kind: "subscription", subscription: billing.setStatus(subscriptionId, "canceled") });
    expect(await tenantPlan(tenantId)).toBe("basic");
    const messages = await owner.select().from(messageLog).where(eq(messageLog.tenantId, tenantId));
    expect(messages.filter((m) => m.templateKey === "manager.payment_failed")).toHaveLength(2);
    expect(messages.find((m) => m.templateKey === "manager.subscription_ended")?.data).toEqual({
      reason: "unpaid",
    });
    // Elle peut reprendre un pack payant : nouvelle page de paiement.
    expect(
      (
        await platform(async (tx) =>
          requestPlanChange(tx, tenantId, await planId("essentiel"), billing.gateway, urls),
        )
      ).kind,
    ).toBe("redirect");
  });

  it("portail Stripe pour la carte et les factures ; sans Stripe configuré, message clair", async () => {
    const tenantId = await setup();
    await subscribe(tenantId, "essentiel");
    expect(
      await platform((tx) => openBillingPortal(tx, tenantId, billing.gateway, "https://app.test")),
    ).toContain("billing.stripe.test/portal/");
    expect(
      await errorCode(
        platform(async (tx) => requestPlanChange(tx, tenantId, await planId("serenite"), null, urls)),
      ),
    ).toBe("payments_unavailable");
  });

  it("la gérante ne peut ni lire l'abonnement d'un autre, ni modifier le sien directement (base)", async () => {
    const a = await setup();
    const b = await setup();
    await subscribe(a, "essentiel");
    await subscribe(b, "essentiel");
    const visible = await withTenant(a, (tx) => tx.select().from(subscriptions), app);
    expect(visible.map((row) => row.tenantId)).toEqual([a]);
    await expect(
      withTenant(
        a,
        (tx) => tx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.tenantId, a)),
        app,
      ),
    ).rejects.toThrow();
  });
});
