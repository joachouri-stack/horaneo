import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import {
  planOptions,
  plans,
  smsPacks,
  tenantOptions,
  subscriptions,
  tenants,
  usageCounters,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { AppError } from "@/modules/errors";
import { setPlatformSetting } from "@/modules/settings";
import type { BillingGateway } from "./gateway";
import { EVERYTHING_IN, HIGHLIGHT_KEYS, MAX_HIGHLIGHTS, twinRuleViolations } from "./showcase";
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
  "sitePages",
  "customDomain",
  "localSeo",
  "contactButtons",
  "mobileReady",
  "contactForm",
  "onlinePayment",
  "paymentLinks",
  "promoCodes",
  "promotions",
  "testimonials",
  "giftCards",
  "googleReviews",
  "customerSpace",
  "loyalty",
  "kickoffCall",
  "copywriting",
  "photoRetouch",
  "businessSections",
  "seoPages",
  "searchConsole",
  "googleBusiness",
  "visibilityReport",
  "multilingual",
  "qrPoster",
  "stats",
  "monthlySummary",
  "monthlyUpdate",
  "onDemandUpdates",
  "emailSupport",
  "whatsappSupport",
  "brandingFooter",
  "aiMessaging",
  "gallery",
  "selfEditing",
  "advancedBranding",
  "premiumBranding",
  "advancedStats",
  "advancedSeo",
  "richContent",
  "advancedPresentation",
  "prioritySupport",
  "dedicatedSupport",
  "helpCenter",
  "ticketSupport",
  "priorityHumanSupport",
  "setupAssistance",
  "freeDomain",
  "staffPlanning",
  "customerFile",
  "advancedCrm",
  "marketingAutomation",
  "aiChatbot",
  "whatsappAssistant",
  "aiTexts",
  "aiImages",
  "commerce",
  "formation",
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
  /** Nombre de pages annoncé (vide : sans limite). */
  pages: z.string().default("").pipe(optionalLimit),
  /** Fiches clients (vide : illimité). */
  customers: z.string().default("").pipe(optionalLimit),
  /** Quotas mensuels des outils intelligents (0 : non inclus ; vide : illimité). */
  aiChatConversations: z.string().default("0").pipe(optionalLimit),
  whatsappConversations: z.string().default("0").pipe(optionalLimit),
  aiTexts: z.string().default("0").pipe(optionalLimit),
  aiImages: z.string().default("0").pipe(optionalLimit),
  /** Frais de création de la formule sans engagement, en euros (vide : aucun). */
  noCommitmentFee: z
    .string()
    .trim()
    .regex(/^(\d{1,5}([.,]\d{1,2})?)?$/)
    .default(""),
  /** Lignes visibles sur la carte, dans l'ordre (6 au plus). */
  highlights: z
    .array(z.string().regex(/^(everythingIn:[a-z0-9-]+|[A-Za-z]+)$/))
    .max(MAX_HIGHLIGHTS)
    .default([]),
  /** Pack « site seul » : code du pack avec réservation qui le reprend. */
  bookingTwinCode: z.string().trim().max(40).default(""),
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
    pages: input.pages,
    customers: input.customers,
    aiChatConversations: input.aiChatConversations,
    whatsappConversations: input.whatsappConversations,
    aiTexts: input.aiTexts,
    aiImages: input.aiImages,
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
      noCommitmentFeeCents: input.noCommitmentFee
        ? Math.round(Number(input.noCommitmentFee.replace(",", ".")) * 100)
        : null,
      highlights: input.highlights.filter(
        (key) => key.startsWith(EVERYTHING_IN) || HIGHLIGHT_KEYS.includes(key),
      ),
      bookingTwinCode: input.bookingTwinCode || null,
      ...(priceChanged ? { stripePriceId: null } : {}),
    })
    .where(eq(plans.id, plan.id));
  // Règle des jumeaux : un pack « site seul » ne peut pas comprendre plus que son jumeau avec réservation.
  const problems = twinRuleViolations(await tx.select().from(plans));
  if (problems.length > 0) throw new AppError("twin_rule", problems[0]);
  if (priceChanged && priceCents > 0 && gateway) await ensurePlanPrice(tx, plan.id, gateway);
  return { priceChanged, before: plan.priceCents, after: priceCents };
}

export const settingsInput = z.object({
  prices_display: z.enum(["TTC", "HT"]),
  vat_rate_percent: z.coerce.number().min(0).max(50),
  commitment_months: z.coerce.number().int().min(0).max(36),
  sms_pack_size: z.coerce.number().int().min(1).max(10000),
  /** Prix du pack de SMS, en euros. */
  sms_pack_price: z
    .string()
    .trim()
    .regex(/^\d{1,5}([.,]\d{1,2})?$/),
  sms_warning_percent: z.coerce.number().int().min(1).max(99),
  price_change_notice_days: z.coerce.number().int().min(0).max(180),
  /** Rachat du site à la sortie : activé ou non, et son prix en euros. */
  site_buyout_enabled: z.boolean(),
  site_buyout_price: z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,2})?$/),
  /** Fonctions annoncées « Bientôt » (pas encore livrées). */
  features_soon: z.array(z.enum(FEATURE_KEYS)),
  /** Formule sans engagement proposée à la commande (avec les frais de création du pack). */
  offer_no_commitment: z.boolean().default(false),
  /** Solutions ouvertes à la souscription (les autres : « Disponible bientôt »). */
  solutions_available: z.array(z.enum(["booking", "commerce", "formation"])).default(["booking"]),
  /** Adresse de la démonstration (vide : bouton masqué). */
  demo_url: z.union([z.literal(""), z.url().max(300)]).default(""),
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
  const { sms_pack_price, site_buyout_price, solutions_available, ...rest } = input;
  await setPlatformSetting(
    tx,
    "solutions",
    (["booking", "commerce", "formation"] as const).map((code) => ({
      code,
      status: solutions_available.includes(code) ? ("available" as const) : ("soon" as const),
    })),
  );
  for (const [key, value] of Object.entries(rest)) {
    await setPlatformSetting(tx, key as keyof typeof rest, value as never);
  }
  const toCents = (euros: string) => Math.round(Number(euros.replace(",", ".")) * 100);
  await setPlatformSetting(tx, "sms_pack_price_cents", toCents(sms_pack_price));
  await setPlatformSetting(tx, "site_buyout_price_cents", toCents(site_buyout_price));
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

/** Revenu mensuel réel : abonnements Stripe en cours (packs et options facturées). */
export async function liveRevenue(tx: Transaction) {
  const rows = await listSubscriptions(tx);
  const live = rows.filter((row) => row.live && row.subscription.stripeSubscriptionId);
  const liveTenants = live.map((row) => row.subscription.tenantId);
  const [options] = liveTenants.length
    ? await tx
        .select({ cents: sql<number>`coalesce(sum(${planOptions.priceCents}), 0)::int` })
        .from(tenantOptions)
        .innerJoin(planOptions, eq(planOptions.id, tenantOptions.optionId))
        .where(
          and(
            inArray(tenantOptions.tenantId, liveTenants),
            isNotNull(tenantOptions.stripeSubscriptionItemId),
          ),
        )
    : [{ cents: 0 }];
  return {
    monthlyRevenueCents: live.reduce((sum, row) => sum + row.priceCents, 0) + options.cents,
    paying: live.length,
    pastDue: rows.filter((row) => row.subscription.paymentFailedAt && row.live).length,
  };
}

/**
 * SMS envoyés par tous les clients, mois par mois (pour suivre le coût chez le
 * fournisseur), avec les packs de SMS vendus le même mois.
 */
export async function smsMonthlyTotals(tx: Transaction, months = 12) {
  const sent = await tx
    .select({
      period: usageCounters.period,
      fromQuota: sql<number>`sum(${usageCounters.smsSent})::int`,
      fromPacks: sql<number>`sum(${usageCounters.smsFromPacks})::int`,
    })
    .from(usageCounters)
    .groupBy(usageCounters.period)
    .orderBy(desc(usageCounters.period))
    .limit(months);
  const sold = await tx
    .select({
      period: sql<string>`to_char(${smsPacks.paidAt} AT TIME ZONE 'Europe/Paris', 'YYYY-MM')`,
      packs: sql<number>`count(*)::int`,
      revenueCents: sql<number>`sum(${smsPacks.priceCents})::int`,
    })
    .from(smsPacks)
    .where(sql`${smsPacks.paidAt} is not null`)
    .groupBy(sql`1`);
  const soldOf = new Map(sold.map((row) => [row.period, row]));
  return sent.map((row) => ({
    ...row,
    total: row.fromQuota + row.fromPacks,
    packsSold: soldOf.get(row.period)?.packs ?? 0,
    packsRevenueCents: soldOf.get(row.period)?.revenueCents ?? 0,
  }));
}
