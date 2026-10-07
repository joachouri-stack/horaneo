import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { plans, subscriptions, tenants, type PlanFeatures, type PlanLimits } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { setPlatformSetting } from "@/modules/settings";
import type { BillingGateway } from "./gateway";
import { ensurePlanPrice, isLive } from "./subscriptions";

/** Réglages des packs et des abonnements, depuis l'espace admin (rôle plateforme). */

const optionalLimit = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().int().min(0).max(1_000_000).nullable());

export const FEATURE_KEYS = [
  "onlineBooking",
  "fullSite",
  "customDomain",
  "onlinePayment",
  "promoCodes",
  "testimonials",
  "stats",
  "monthlySummary",
  "brandingFooter",
  "emailSupport",
  "whatsappSupport",
  "promotions",
  "googleReviews",
  "giftCards",
  "monthlyUpdate",
  "onDemandUpdates",
  "aiMessaging",
  "customerSpace",
  "loyalty",
  "localSeo",
  "contactButtons",
  "mobileReady",
  "sitePages",
  "customDesign",
] as const;

export const planInput = z.object({
  name: z.string().trim().min(1).max(40),
  /** Accroche affichée sous le nom du pack sur le site commercial. */
  description: z.string().trim().max(80).default(""),
  /** Prix mensuel en euros (« 39,99 »). */
  price: z
    .string()
    .trim()
    .regex(/^\d{1,5}([.,]\d{1,2})?$/),
  onlineBookingsPerMonth: optionalLimit,
  members: optionalLimit,
  photos: optionalLimit,
  services: optionalLimit,
  /** Jamais de SMS illimités : un nombre est obligatoire (0 = aucun SMS). */
  smsPerMonth: z.coerce.number().int().min(0).max(100_000),
  /** Frais de création propres au pack, en euros ; vide : réglage général. */
  setupFee: z
    .string()
    .trim()
    .regex(/^(\d{1,5}([.,]\d{1,2})?)?$/)
    .default(""),
  features: z.array(z.enum(FEATURE_KEYS)),
  isPublic: z.boolean(),
});

/**
 * Modifie un pack. Un changement de prix crée un nouveau prix Stripe pour les
 * prochaines souscriptions ; les abonnements en cours gardent leur ancien prix.
 */
export async function savePlan(
  tx: Transaction,
  planId: string,
  raw: z.input<typeof planInput>,
  gateway: BillingGateway | null,
) {
  const input = planInput.parse(raw);
  const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
  if (!plan) throw new AppError("not_found");
  const priceCents = Math.round(Number(input.price.replace(",", ".")) * 100);
  const limits: PlanLimits = {
    onlineBookingsPerMonth: input.onlineBookingsPerMonth,
    members: input.members,
    photos: input.photos,
    services: input.services,
    smsPerMonth: input.smsPerMonth,
  };
  const features: PlanFeatures = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, input.features.includes(key)]),
  );
  const priceChanged = priceCents !== plan.priceCents;
  // Il faut toujours un pack gratuit : c'est là que vont les sites dont l'abonnement se termine.
  if (plan.priceCents <= 0 && priceCents > 0) {
    const [other] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.priceCents, 0), ne(plans.id, plan.id)))
      .limit(1);
    if (!other) throw new AppError("last_free_plan", "price");
  }
  await tx
    .update(plans)
    .set({
      name: { ...plan.name, fr: input.name },
      description: { ...plan.description, fr: input.description },
      priceCents,
      limits,
      features,
      isPublic: input.isPublic,
      setupFeeCents: input.setupFee ? Math.round(Number(input.setupFee.replace(",", ".")) * 100) : null,
      ...(priceChanged ? { stripePriceId: null } : {}),
    })
    .where(eq(plans.id, plan.id));
  if (priceChanged && priceCents > 0 && gateway) await ensurePlanPrice(tx, plan.id, gateway);
  return { priceChanged, before: plan.priceCents, after: priceCents };
}

export const settingsInput = z.object({
  prices_display: z.enum(["TTC", "HT"]),
  vat_rate_percent: z.coerce.number().min(0).max(50),
  commitment_months: z.coerce.number().int().min(0).max(36),
  /** Frais de création en euros. */
  setup_fee: z
    .string()
    .trim()
    .regex(/^\d{1,5}([.,]\d{1,2})?$/),
  go_live_delay_days: z.coerce.number().int().min(0).max(60),
  deposit_commission_percent: z.coerce.number().min(0).max(20),
  retention_days_after_cancel: z.coerce.number().int().min(0).max(365),
  replaced_asset_retention_days: z.coerce.number().int().min(1).max(90),
  sms_reminder_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  email_reminder_hours_before: z.coerce.number().int().min(2).max(72),
  daily_summary_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  monthly_summary_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  legal_infrastructure: z.string().trim().min(5).max(300),
});

export async function updatePlatformSettings(tx: Transaction, raw: z.input<typeof settingsInput>) {
  const input = settingsInput.parse(raw);
  const { setup_fee, ...rest } = input;
  for (const [key, value] of Object.entries(rest)) {
    await setPlatformSetting(tx, key as keyof typeof rest, value as never);
  }
  await setPlatformSetting(tx, "setup_fee_cents", Math.round(Number(setup_fee.replace(",", ".")) * 100));
  return input;
}

/** Abonnements des clients : échecs de prélèvement d'abord. */
export async function listSubscriptions(tx: Transaction) {
  const scheduledPlan = alias(plans, "scheduled_plan");
  const rows = await tx
    .select({
      subscription: subscriptions,
      tenantName: tenants.name,
      planName: plans.name,
      priceCents: plans.priceCents,
      scheduledPlanName: scheduledPlan.name,
    })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(scheduledPlan, eq(scheduledPlan.id, subscriptions.scheduledPlanId))
    .orderBy(
      sql`${subscriptions.paymentFailedAt} is null`,
      desc(subscriptions.paymentFailedAt),
      asc(tenants.name),
    );
  return rows.map((row) => ({ ...row, live: isLive(row.subscription.status) }));
}

/** Revenu mensuel réel : abonnements Stripe en cours. */
export async function liveRevenue(tx: Transaction) {
  const rows = await listSubscriptions(tx);
  const live = rows.filter((row) => row.live && row.subscription.stripeSubscriptionId);
  return {
    monthlyRevenueCents: live.reduce((sum, row) => sum + row.priceCents, 0),
    paying: live.length,
    pastDue: rows.filter((row) => row.subscription.paymentFailedAt && row.live).length,
  };
}
