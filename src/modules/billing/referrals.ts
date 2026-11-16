import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Transaction } from "@/db/client";
import { orders, plans, referrals, subscriptions, tenants } from "@/db/schema";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { AppError } from "@/modules/errors";
import { getPlatformSetting } from "@/modules/settings";
import type { BillingGateway } from "./gateway";
import { isReferralCode } from "./referral-link";
import { isLive } from "./subscriptions";
import { withVatCents } from "./vat";

/**
 * Parrainage : chaque cliente a un lien (adresse du site commercial + son
 * identifiant de site). Une commande passée après ce lien est rattachée à la
 * marraine ; quand la nouvelle cliente a payé son premier mois (après l'essai),
 * la marraine reçoit des mois offerts (réglage referral_reward_months), crédités
 * sur son compte Stripe et déduits de ses prochaines factures.
 * Sans abonnement Stripe en cours chez la marraine, l'équipe l'accorde à la main.
 */

/** Mois offerts par parrainage (0 : parrainage désactivé). */
export async function referralRewardMonths(tx: Transaction) {
  return Math.max(0, Number(await getPlatformSetting(tx, "referral_reward_months")) || 0);
}

/** Marraine désignée par un code de parrainage : un site en ligne, parrainage activé. */
export async function referrerFromCode(tx: Transaction, code: string | null | undefined) {
  if (!isReferralCode(code) || (await referralRewardMonths(tx)) === 0) return null;
  const [tenant] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(and(eq(tenants.slug, code), eq(tenants.status, "active")));
  return tenant?.id ?? null;
}

/** Commande parrainée payée (souvent en essai) : le parrainage attend le premier vrai paiement. */
export async function recordReferral(tx: Transaction, orderId: string) {
  const [order] = await tx
    .select({ referrerTenantId: orders.referrerTenantId })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order?.referrerTenantId) return null;
  const months = await referralRewardMonths(tx);
  if (months === 0) return null;
  const [created] = await tx
    .insert(referrals)
    .values({ tenantId: order.referrerTenantId, orderId, rewardMonths: months })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

/** Commande refusée : le parrainage en attente est annulé. */
export async function cancelReferralOfOrder(tx: Transaction, orderId: string) {
  await tx
    .update(referrals)
    .set({ status: "cancelled" })
    .where(and(eq(referrals.orderId, orderId), eq(referrals.status, "pending")));
}

/**
 * Facture payée d'un abonnement : si c'est le premier vrai paiement (montant
 * réglé, abonnement sorti de l'essai) d'une nouvelle cliente parrainée, la
 * marraine reçoit ses mois offerts.
 */
export async function rewardReferral(
  tx: Transaction,
  input: { subscriptionId: string; amountPaidCents: number },
  gateway: BillingGateway | null,
  now = new Date(),
) {
  if (input.amountPaidCents <= 0 || !gateway) return null;
  const [row] = await tx
    .select({ referral: referrals })
    .from(referrals)
    .innerJoin(orders, eq(orders.id, referrals.orderId))
    .where(and(eq(orders.stripeSubscriptionId, input.subscriptionId), eq(referrals.status, "pending")))
    .for("update", { of: referrals });
  if (!row) return null;
  const { referral } = row;
  // Frais de création payés pendant l'essai : ce n'est pas encore le premier mois.
  const remote = await gateway.retrieveSubscription(input.subscriptionId);
  if (remote.status !== "active") return null;

  const [sponsor] = await tx
    .select({
      customerId: subscriptions.stripeCustomerId,
      status: subscriptions.status,
      priceCents: plans.priceCents,
      currency: plans.currency,
      locale: tenants.defaultLocale,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .where(eq(subscriptions.tenantId, referral.tenantId));
  if (!sponsor?.customerId || !isLive(sponsor.status) || sponsor.priceCents <= 0) {
    await tx.update(referrals).set({ status: "manual" }).where(eq(referrals.id, referral.id));
    return { outcome: "referral_manual" as const };
  }
  // Crédit TTC (déduit du total des factures) : le prix du pack, TVA comprise si elle s'ajoute.
  const vat = Number(await getPlatformSetting(tx, "vat_rate_percent"));
  const monthCents =
    (await getPlatformSetting(tx, "prices_display")) === "HT"
      ? withVatCents(sponsor.priceCents, vat)
      : sponsor.priceCents;
  const creditCents = monthCents * referral.rewardMonths;
  if (creditCents > 0) {
    const t = await getTranslator(resolveLocale(sponsor.locale));
    await gateway.creditCustomer({
      customerId: sponsor.customerId,
      amountCents: creditCents,
      currency: sponsor.currency,
      description: t("billing.referralCreditLabel", { months: referral.rewardMonths }),
      idempotencyKey: `referral:${referral.id}`,
    });
  }
  await tx
    .update(referrals)
    .set({ status: "rewarded", creditCents, rewardedAt: now })
    .where(eq(referrals.id, referral.id));
  return { outcome: "referral_rewarded" as const };
}

/** Espace gérante : son code et ses parrainages. */
export async function referralOverview(tx: Transaction, tenantId: string) {
  const [tenant] = await tx
    .select({ slug: tenants.slug, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const rows = await tx
    .select({
      status: referrals.status,
      count: sql<number>`count(*)::int`,
      months: sql<number>`coalesce(sum(${referrals.rewardMonths}), 0)::int`,
    })
    .from(referrals)
    .where(eq(referrals.tenantId, tenantId))
    .groupBy(referrals.status);
  const of = (status: string) => rows.find((row) => row.status === status);
  return {
    code: tenant?.slug ?? null,
    /** Le lien ne fonctionne que pour un site en ligne. */
    active: tenant?.status === "active",
    rewardMonths: await referralRewardMonths(tx),
    pending: of("pending")?.count ?? 0,
    rewarded: (of("rewarded")?.count ?? 0) + (of("manual")?.count ?? 0),
    monthsEarned: (of("rewarded")?.months ?? 0) + (of("manual")?.months ?? 0),
  };
}

/** Espace admin : tous les parrainages, les plus récents d'abord. */
export async function listReferrals(tx: Transaction) {
  const sponsor = alias(tenants, "sponsor");
  return tx
    .select({
      referral: referrals,
      sponsorName: sponsor.name,
      currency: sponsor.currency,
      businessName: orders.businessName,
    })
    .from(referrals)
    .innerJoin(sponsor, eq(sponsor.id, referrals.tenantId))
    .innerJoin(orders, eq(orders.id, referrals.orderId))
    .orderBy(desc(referrals.createdAt));
}

/** Mois offerts accordés à la main par l'équipe (marraine sans abonnement Stripe). */
export async function markReferralGranted(tx: Transaction, referralId: string, now = new Date()) {
  const [updated] = await tx
    .update(referrals)
    .set({ status: "rewarded", rewardedAt: now })
    .where(and(eq(referrals.id, referralId), eq(referrals.status, "manual")))
    .returning();
  if (!updated) throw new AppError("not_found");
  return { referralId: updated.id, months: updated.rewardMonths };
}
