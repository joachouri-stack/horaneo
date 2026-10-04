import { asc, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { plans, type PlanFeatures, type PlanLimits } from "@/db/schema";

/** Packs proposés (site commercial, page Abonnement), du moins cher au plus cher. */
export async function listPublicPlans(tx: Transaction) {
  return tx
    .select()
    .from(plans)
    .where(eq(plans.isPublic, true))
    .orderBy(asc(plans.sortOrder), asc(plans.priceCents));
}

const LIMIT_KEYS = ["onlineBookingsPerMonth", "members", "photos", "services", "smsPerMonth"] as const;
const FEATURE_KEYS = [
  "fullSite",
  "customDomain",
  "onlinePayment",
  "promoCodes",
  "testimonials",
  "stats",
  "monthlySummary",
  "emailSupport",
  "whatsappSupport",
] as const;

export type PlanHighlight =
  | { kind: "limit"; key: (typeof LIMIT_KEYS)[number]; count: number }
  | { kind: "feature"; key: (typeof FEATURE_KEYS)[number] };

/**
 * Ce qu'un pack comprend, à traduire à l'affichage. Une limite absente vaut
 * « illimité » (-1), sauf pour les SMS : jamais de SMS illimités (0 si absent).
 */
export function planHighlights(plan: { limits: PlanLimits; features: PlanFeatures }): PlanHighlight[] {
  const limits: PlanHighlight[] = LIMIT_KEYS.map((key) => {
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
