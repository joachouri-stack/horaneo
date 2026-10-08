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

/** Frais de création d'un pack : les siens s'ils sont fixés, sinon le réglage général. */
export async function setupFeeFor(tx: Transaction, plan: { setupFeeCents: number | null }) {
  return plan.setupFeeCents ?? Number(await getPlatformSetting(tx, "setup_fee_cents"));
}

/** Formules des packs payants : durée de l'engagement et frais de création ajoutés sans engagement. */
export async function commitmentTerms(tx: Transaction) {
  return {
    /** 0 : aucune formule avec engagement (tout est sans engagement, sans frais en plus). */
    months: Number(await getPlatformSetting(tx, "commitment_months")),
    noCommitmentFeeCents: Number(await getPlatformSetting(tx, "no_commitment_setup_fee_cents")),
  };
}

/**
 * Frais de création selon la formule choisie : ceux du pack avec engagement
 * (souvent offerts), plus les frais de la formule sans engagement sinon.
 */
export async function setupFeeForFormula(
  tx: Transaction,
  plan: { setupFeeCents: number | null },
  withCommitment: boolean,
) {
  const base = await setupFeeFor(tx, plan);
  const terms = await commitmentTerms(tx);
  return withCommitment || terms.months <= 0 ? base : base + terms.noCommitmentFeeCents;
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
