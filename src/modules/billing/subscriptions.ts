import { and, asc, eq } from "drizzle-orm";
import { creationFeeFor } from "./plans";
import type { Transaction } from "@/db/client";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { businesses, plans, subscriptions, tenants } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { expireSmsPacks } from "@/modules/messages/sms-usage";
import { getPlatformSetting, setPlatformSetting } from "@/modules/settings";
import { changePlan } from "@/modules/tenants/update";
import type { BillingGateway, BillingSubscription } from "./gateway";

/**
 * Abonnements des professionnels (Stripe Billing, rôle plateforme).
 * Décisions validées :
 * - pack supérieur : immédiat, différence facturée au prorata ;
 * - pack inférieur : à la fin de la période en cours ;
 * - passage au Basic : à la fin de la période, et au plus tôt à la fin de l'engagement ;
 * - prélèvement définitivement impayé : retour automatique au Basic, rien n'est supprimé.
 */

/** Statuts Stripe pendant lesquels le pack payant reste actif. */
const LIVE_STATUSES = ["active", "trialing", "past_due"];
/** Statuts Stripe qui mettent fin au pack payant. */
const ENDED_STATUSES = ["canceled", "unpaid", "incomplete_expired"];

export function isLive(status: string | null | undefined) {
  return Boolean(status && LIVE_STATUSES.includes(status));
}

function billingError(error: unknown): never {
  if (error instanceof AppError) throw error;
  console.error("[abonnement]", error);
  throw new AppError("payment_provider_error");
}

async function loadTenant(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ tenant: tenants, plan: plans })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  return row;
}

async function primaryBusiness(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select()
    .from(businesses)
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.isPrimary, true)));
  return row ?? null;
}

async function freePlan(tx: Transaction) {
  // Le pack gratuit (prix 0) le mieux classé : le Basic.
  const [plan] = await tx
    .select()
    .from(plans)
    .where(eq(plans.priceCents, 0))
    .orderBy(asc(plans.sortOrder))
    .limit(1);
  if (!plan) throw new Error("Aucun pack gratuit configuré");
  return plan;
}

export async function getSubscription(tx: Transaction, tenantId: string) {
  const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId));
  return row ?? null;
}

/** Prix Stripe d'un pack payant, créé au besoin (avec son produit). */
export async function ensurePlanPrice(tx: Transaction, planId: string, gateway: BillingGateway) {
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new AppError("not_found");
  if (plan.priceCents <= 0) throw new AppError("invalid", "priceCents");
  if (plan.stripePriceId) return plan.stripePriceId;
  const display = await getPlatformSetting(tx, "prices_display");
  let productId = plan.stripeProductId;
  if (!productId) {
    const name = plan.name.fr ?? Object.values(plan.name)[0] ?? plan.code;
    productId = (await gateway.createProduct({ name, metadata: { plan_id: plan.id } }).catch(billingError))
      .id;
  }
  const price = await gateway
    .createPrice({
      productId,
      amountCents: plan.priceCents,
      currency: plan.currency,
      interval: plan.interval,
      taxInclusive: display === "TTC",
      metadata: { plan_id: plan.id },
    })
    .catch(billingError);
  await tx
    .update(plans)
    .set({ stripeProductId: productId, stripePriceId: price.id })
    .where(eq(plans.id, plan.id));
  return price.id;
}

/** Taux de TVA Stripe correspondant aux réglages (créé une fois, recréé si le taux change). */
export async function ensureTaxRate(tx: Transaction, gateway: BillingGateway) {
  const percent = Number(await getPlatformSetting(tx, "vat_rate_percent"));
  if (!percent) return null;
  const inclusive = (await getPlatformSetting(tx, "prices_display")) === "TTC";
  const current = await getPlatformSetting(tx, "stripe_tax_rate");
  if (current && current.percent === percent && current.inclusive === inclusive) return current.id;
  const rate = await gateway.createTaxRate({ percent, inclusive, name: "TVA" }).catch(billingError);
  await setPlatformSetting(tx, "stripe_tax_rate", { id: rate.id, percent, inclusive });
  return rate.id;
}

export async function ensureCustomer(tx: Transaction, tenantId: string, gateway: BillingGateway) {
  const { tenant, plan } = await loadTenant(tx, tenantId);
  const existing = await getSubscription(tx, tenantId);
  if (existing?.stripeCustomerId) return existing;
  const customer = await gateway
    .createCustomer({
      email: tenant.email,
      // Facturé à l'entreprise principale du site (celle qui règle l'abonnement).
      name: (await primaryBusiness(tx, tenantId))?.legalName || tenant.name,
      metadata: { tenant_id: tenant.id },
    })
    .catch(billingError);
  if (existing) {
    const [updated] = await tx
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id })
      .where(eq(subscriptions.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await tx
    .insert(subscriptions)
    .values({ tenantId, planId: plan.id, stripeCustomerId: customer.id, status: "none" })
    .returning();
  return created;
}

export type PlanChangeResult =
  | { kind: "redirect"; url: string }
  | { kind: "upgraded" | "downgraded" | "downgrade_scheduled" | "cancel_scheduled" | "kept" };

/**
 * Changement de pack demandé par la gérante (ou l'administratrice pour elle).
 * Depuis le Basic : renvoie l'adresse du paiement Stripe pour souscrire.
 */
export async function requestPlanChange(
  tx: Transaction,
  tenantId: string,
  targetPlanId: string,
  gateway: BillingGateway | null,
  urls: { successUrl: string; cancelUrl: string; withCommitment?: boolean },
  now = new Date(),
): Promise<PlanChangeResult> {
  if (!gateway) throw new AppError("payments_unavailable");
  const { tenant, plan: current } = await loadTenant(tx, tenantId);
  const [target] = await tx.select().from(plans).where(eq(plans.id, targetPlanId));
  if (!target || (!target.isPublic && target.id !== current.id)) throw new AppError("invalid", "planId");
  const subscription = await getSubscription(tx, tenantId);
  const live = subscription?.stripeSubscriptionId && isLive(subscription.status) ? subscription : null;

  // Sans abonnement payant : souscription par la page de paiement Stripe.
  if (!live) {
    if (target.priceCents <= 0) {
      if (target.id === current.id) return { kind: "kept" };
      // Pack payant attribué par l'équipe (sans abonnement) : retour libre au pack gratuit.
      await changePlan(tx, tenantId, target.code);
      return { kind: "downgraded" };
    }
    const row = await ensureCustomer(tx, tenantId, gateway);
    const priceId = await ensurePlanPrice(tx, target.id, gateway);
    // Formule choisie : avec engagement (frais du pack), ou sans (frais de création en plus).
    const withCommitment = urls.withCommitment ?? true;
    const setupFeeCents = await creationFeeFor(tx, target, withCommitment);
    const checkout = await gateway
      .createCheckout({
        customerId: row.stripeCustomerId!,
        priceId,
        setupFee:
          setupFeeCents > 0
            ? {
                amountCents: setupFeeCents,
                currency: target.currency,
                label: (await getTranslator(resolveLocale(tenant.defaultLocale)))("billing.setupFeeLabel"),
              }
            : null,
        taxRateId: await ensureTaxRate(tx, gateway),
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
        metadata: { tenant_id: tenantId, plan_id: target.id, commitment: withCommitment ? "yes" : "no" },
      })
      .catch(billingError);
    return { kind: "redirect", url: checkout.url };
  }

  const stripeId = live.stripeSubscriptionId!;
  // Toute demande remplace la précédente : un changement ou une fin programmés sont d'abord annulés.
  const resetPending = async () => {
    const remote = await gateway.retrieveSubscription(stripeId).catch(billingError);
    if (remote.scheduleId) await gateway.releaseSchedule(remote.scheduleId).catch(billingError);
    if (remote.cancelAt)
      await gateway.setCancelAt({ subscriptionId: stripeId, at: null }).catch(billingError);
    await tx
      .update(subscriptions)
      .set({ scheduledPlanId: null, cancelAt: null, cancelRequestedAt: null })
      .where(eq(subscriptions.id, live.id));
  };

  if (target.id === current.id) {
    await resetPending();
    return { kind: "kept" };
  }

  if (target.priceCents <= 0) {
    // Passage au Basic : fin du pack payant à la fin de la période, pas avant la fin de l'engagement.
    await resetPending();
    const candidates = [live.currentPeriodEnd, live.commitmentEndsAt].filter((d): d is Date => Boolean(d));
    const at = candidates.length ? new Date(Math.max(...candidates.map((d) => d.getTime()))) : null;
    const remote = await gateway.setCancelAt({ subscriptionId: stripeId, at: at ?? now }).catch(billingError);
    await tx
      .update(subscriptions)
      .set({ cancelAt: remote.cancelAt ?? at, cancelRequestedAt: now })
      .where(eq(subscriptions.id, live.id));
    return { kind: "cancel_scheduled" };
  }

  const priceId = await ensurePlanPrice(tx, target.id, gateway);
  if (target.priceCents > current.priceCents) {
    await resetPending();
    const remote = await gateway.changePriceNow({ subscriptionId: stripeId, priceId }).catch(billingError);
    await tx
      .update(subscriptions)
      .set({ planId: target.id, status: remote.status, currentPeriodEnd: remote.currentPeriodEnd })
      .where(eq(subscriptions.id, live.id));
    await changePlan(tx, tenantId, target.code);
    return { kind: "upgraded" };
  }

  await resetPending();
  await gateway.schedulePriceChange({ subscriptionId: stripeId, priceId }).catch(billingError);
  await tx.update(subscriptions).set({ scheduledPlanId: target.id }).where(eq(subscriptions.id, live.id));
  return { kind: "downgrade_scheduled" };
}

/** Portail Stripe : carte bancaire et factures. */
export async function openBillingPortal(
  tx: Transaction,
  tenantId: string,
  gateway: BillingGateway | null,
  returnUrl: string,
) {
  if (!gateway) throw new AppError("payments_unavailable");
  const subscription = await getSubscription(tx, tenantId);
  if (!subscription?.stripeCustomerId) throw new AppError("not_found");
  return (
    await gateway.createPortal({ customerId: subscription.stripeCustomerId, returnUrl }).catch(billingError)
  ).url;
}

// ─── Événements Stripe ────────────────────────────────────────────────────────

async function rowForSubscription(tx: Transaction, sub: BillingSubscription) {
  const [byId] = await tx.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, sub.id));
  if (byId) return byId;
  const [byCustomer] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeCustomerId, sub.customerId));
  if (byCustomer) return byCustomer;
  const tenantId = sub.metadata.tenant_id;
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return null;
  const [created] = await tx
    .insert(subscriptions)
    .values({ tenantId, planId: tenant.planId, stripeCustomerId: sub.customerId, status: "none" })
    .onConflictDoNothing()
    .returning();
  return created ?? (await getSubscription(tx, tenantId));
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Applique l'état d'un abonnement reçu de Stripe : pack de l'établissement,
 * échéance, fin programmée, engagement. Sans effet si rien n'a changé.
 */
export async function applySubscription(tx: Transaction, sub: BillingSubscription, now = new Date()) {
  const row = await rowForSubscription(tx, sub);
  if (!row) return { outcome: "unknown_tenant" as const };

  if (ENDED_STATUSES.includes(sub.status)) {
    // Fin du pack payant (passage au Basic demandé, ou impayé) : retour au pack gratuit.
    if (row.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id) return { outcome: "stale" as const };
    const basic = await freePlan(tx);
    const voluntary = Boolean(row.cancelRequestedAt);
    await tx
      .update(subscriptions)
      .set({
        stripeSubscriptionId: sub.id,
        status: sub.status,
        planId: basic.id,
        scheduledPlanId: null,
        cancelAt: null,
        cancelRequestedAt: null,
        currentPeriodEnd: null,
        commitmentEndsAt: null,
        withCommitment: null,
      })
      .where(eq(subscriptions.id, row.id));
    // Les SMS achetés ne restent disponibles que tant que l'abonnement est actif.
    await expireSmsPacks(tx, row.tenantId, now);
    const { tenant } = await loadTenant(tx, row.tenantId);
    if (tenant.planId !== basic.id) {
      await changePlan(tx, row.tenantId, basic.code);
      await queueMessage(tx, {
        tenantId: row.tenantId,
        template: "manager.subscription_ended",
        data: { reason: voluntary ? "requested" : "unpaid" },
        dedupeKey: `manager.subscription_ended:${sub.id}`,
      });
    }
    return { outcome: "ended" as const };
  }

  const planId = sub.planId && /^[0-9a-f-]{36}$/i.test(sub.planId) ? sub.planId : row.planId;
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
  const firstActivation = !row.stripeSubscriptionId || row.stripeSubscriptionId !== sub.id;
  let commitmentEndsAt = row.commitmentEndsAt;
  let withCommitment = row.withCommitment;
  if (firstActivation && isLive(sub.status)) {
    // Formule choisie à la souscription (« no » : sans engagement, frais de création déjà payés).
    const months = Number(await getPlatformSetting(tx, "commitment_months"));
    withCommitment = months > 0 && sub.metadata.commitment !== "no";
    commitmentEndsAt = withCommitment ? addMonths(sub.currentPeriodStart ?? now, months) : null;
  }
  await tx
    .update(subscriptions)
    .set({
      stripeSubscriptionId: sub.id,
      stripeCustomerId: sub.customerId,
      status: sub.status,
      planId,
      // Prix réellement facturé (l'ancien prix, tant qu'il est maintenu).
      stripePriceId: sub.priceId ?? row.stripePriceId,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAt: sub.cancelAt,
      commitmentEndsAt,
      withCommitment,
      // Le pack inférieur programmé est désormais en place.
      scheduledPlanId: row.scheduledPlanId === planId ? null : row.scheduledPlanId,
    })
    .where(eq(subscriptions.id, row.id));

  if (isLive(sub.status) && plan) {
    const { tenant } = await loadTenant(tx, row.tenantId);
    if (tenant.planId !== plan.id) await changePlan(tx, row.tenantId, plan.code);
  }
  return { outcome: firstActivation ? ("activated" as const) : ("updated" as const) };
}

/** Prélèvement échoué : la gérante est prévenue (Stripe réessaie automatiquement). */
export async function applyPaymentFailed(
  tx: Transaction,
  input: { subscriptionId: string; invoiceId: string; attempt: number; error: string | null },
  now = new Date(),
) {
  const [row] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, input.subscriptionId));
  if (!row) return { outcome: "unknown_subscription" as const };
  await tx
    .update(subscriptions)
    .set({ paymentFailedAt: now, lastPaymentError: input.error?.slice(0, 500) ?? null, status: "past_due" })
    .where(eq(subscriptions.id, row.id));
  await queueMessage(tx, {
    tenantId: row.tenantId,
    template: "manager.payment_failed",
    data: { attempt: input.attempt },
    dedupeKey: `manager.payment_failed:${input.invoiceId}:${input.attempt}`,
  });
  return { outcome: "recorded" as const };
}

/** Prélèvement réussi : l'alerte d'échec disparaît. */
export async function applyInvoicePaid(tx: Transaction, input: { subscriptionId: string }) {
  await tx
    .update(subscriptions)
    .set({ paymentFailedAt: null, lastPaymentError: null })
    .where(and(eq(subscriptions.stripeSubscriptionId, input.subscriptionId)));
  return { outcome: "recorded" as const };
}

/**
 * Changement de pack fait à la main par l'administratrice (client offert, essai…) :
 * refusé si un abonnement Stripe est en cours, pour ne jamais désynchroniser les deux.
 */
export async function changePlanManually(tx: Transaction, tenantId: string, planCode: string) {
  const subscription = await getSubscription(tx, tenantId);
  if (subscription?.stripeSubscriptionId && isLive(subscription.status))
    throw new AppError("subscription_active");
  return changePlan(tx, tenantId, planCode);
}
