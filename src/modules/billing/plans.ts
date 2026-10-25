import { asc, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { plans, type PlanFeatures, type PlanLimits } from "@/db/schema";
import { getPlatformSetting } from "@/modules/settings";
import { planAllowsBooking } from "./features";

/** Packs proposés (site commercial, page Abonnement), du moins cher au plus cher. */
export async function listPublicPlans(tx: Transaction) {
  return tx
    .select()
    .from(plans)
    .where(eq(plans.isPublic, true))
    .orderBy(asc(plans.sortOrder), asc(plans.priceCents));
}

/** Durée de la formule avec engagement, en mois (0 : aucune formule avec engagement). */
export async function commitmentMonths(tx: Transaction) {
  return Number(await getPlatformSetting(tx, "commitment_months"));
}

/**
 * Frais de création selon la formule : offerts avec engagement, sinon les frais
 * du pack (réglage de chaque pack, payés à la commande). Sans formule avec
 * engagement proposée, tout le monde est sans engagement.
 */
export async function creationFeeFor(
  tx: Transaction,
  plan: { noCommitmentFeeCents: number | null },
  withCommitment: boolean,
) {
  if (withCommitment && (await commitmentMonths(tx)) > 0) return 0;
  return plan.noCommitmentFeeCents ?? 0;
}

/**
 * Nom du premier pack proposé qui comprend une fonction (« à partir du pack … ») :
 * jamais écrit en dur, il suit la configuration des packs. null si aucun.
 */
export async function firstPlanWith(tx: Transaction, feature: keyof PlanFeatures, locale: Locale) {
  const plan = (await listPublicPlans(tx)).find((item) => item.features[feature]);
  return plan ? pickLocalized(plan.name, locale) : null;
}

const LIMIT_KEYS = ["onlineBookingsPerMonth", "members", "photos", "services", "smsPerMonth"] as const;
const FEATURE_KEYS = [
  "fullSite",
  "customDomain",
  "onlinePayment",
  "promoCodes",
  "promotions",
  "testimonials",
  "customerSpace",
  "stats",
  "monthlySummary",
  "giftCards",
  "loyalty",
  "googleReviews",
  // L'assistance par e-mail est offerte à tous les packs : elle n'est pas présentée comme un avantage.
  "whatsappSupport",
  "maintenance",
  "securityProtection",
  "logoCreation",
  "technicalSupport247",
] as const;

export type PlanHighlight =
  | { kind: "limit"; key: (typeof LIMIT_KEYS)[number]; count: number }
  | { kind: "feature"; key: (typeof FEATURE_KEYS)[number] };

/**
 * Ce qu'un pack comprend, à traduire à l'affichage. Une limite absente vaut
 * « illimité » (-1), sauf pour les SMS : jamais de SMS illimités (0 si absent).
 */
export function planHighlights(plan: { limits: PlanLimits; features: PlanFeatures }): PlanHighlight[] {
  // Pack « site seul » : ni réservations ni SMS de rappel à annoncer.
  const keys = planAllowsBooking(plan.features)
    ? LIMIT_KEYS
    : LIMIT_KEYS.filter((key) => key !== "onlineBookingsPerMonth" && key !== "smsPerMonth");
  const limits: PlanHighlight[] = keys.map((key) => {
    const value = plan.limits[key];
    return {
      kind: "limit",
      key,
      count: value === null || value === undefined ? (key === "smsPerMonth" ? 0 : -1) : value,
    };
  });
  const features: PlanHighlight[] = FEATURE_KEYS.filter((key) => plan.features[key]).map((key) => ({
    kind: "feature",
    key,
  }));
  return [...limits, ...features];
}
