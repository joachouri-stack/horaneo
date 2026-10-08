import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { planAllowsBooking } from "./features";

/**
 * Présentation des packs sur le site commercial, calculée à partir de leurs
 * limites et de leurs fonctions (jamais écrites dans le code) :
 * - trois chiffres clés (réservations, membres, SMS ou rappels par e-mail) ;
 * - la liste de ce que le pack ajoute au précédent, les fonctions annoncées
 *   « bientôt », puis ce qui lui manque par rapport au suivant ;
 * - les packs « site seul » (sans réservation) à part, présentés au dos des
 *   packs avec réservation du même rang.
 */

type ShowcasePlan = { limits: PlanLimits; features: PlanFeatures; priceCents: number };

export type ShowcaseTile =
  | { key: "bookings" | "members" | "photos"; count: number | null }
  | { key: "sms"; count: number }
  | { key: "emailReminders" }
  | { key: "pages"; fullSite: boolean }
  | { key: "domain" };

export type ShowcaseItem =
  | { kind: "included"; key: ShowcaseKey; values?: Record<string, number> }
  | { kind: "everythingIn"; planIndex: number }
  | { kind: "missing"; key: ShowcaseKey }
  | { kind: "soon"; key: (typeof SOON_KEYS)[number] };

export type ShowcaseKey =
  | (typeof ROW_KEYS)[number]
  | (typeof SITE_ROW_KEYS)[number]
  | "basePage"
  | "onePage"
  | "agenda"
  | "photosServices"
  | "statsSummary"
  | "smsReminders"
  | "emailReminders";

/** Fonctions présentées, dans l'ordre d'affichage. */
const ROW_KEYS = [
  "fullSite",
  "customDomain",
  "onlinePayment",
  "promoCodes",
  "promotions",
  "testimonials",
  "customerSpace",
  "monthlyUpdate",
  "onDemandUpdates",
  "unlimitedPhotos",
  "photosLimit",
  "stats",
  "monthlySummary",
  "whatsappSupport",
  "giftCards",
  "loyalty",
  "googleReviews",
] as const;

/**
 * Packs « site seul » : ce qui compte pour un site vitrine, le plus parlant
 * d'abord (les photos sont déjà dans les chiffres clés de la carte).
 */
const SITE_ROW_KEYS = [
  "customDesign",
  "fullSite",
  "sitePages",
  "googleReviews",
  "customDomain",
  "localSeo",
  "contactButtons",
  "mobileReady",
  "testimonials",
  "promotions",
  "giftCards",
  "monthlyUpdate",
  "onDemandUpdates",
  "whatsappSupport",
] as const;

/** Fonctions pas encore disponibles, annoncées en fin de liste. */
const SOON_KEYS = ["aiMessaging"] as const;

/** Ce qui manque au pack, par rapport au suivant (deux au plus). */
const MISSING_KEYS = [
  "customDomain",
  "onlinePayment",
  "stats",
  "whatsappSupport",
  // Packs « site seul » : ce que le pack suivant ajoute de plus visible.
  "fullSite",
  "googleReviews",
  "giftCards",
] as const;
const MAX_MISSING = 2;

/** Fonctions liées aux rendez-vous : jamais annoncées sur un pack « site seul ». */
const BOOKING_KEYS = new Set<string>([
  "onlinePayment",
  "promoCodes",
  "customerSpace",
  "stats",
  "monthlySummary",
  "loyalty",
]);

const unlimited = (value: number | null | undefined) => value === null || value === undefined;

export function planTiles(plan: ShowcasePlan): ShowcaseTile[] {
  // Site seul : la taille du site plutôt que réservations et rappels.
  if (!planAllowsBooking(plan.features)) {
    return [
      { key: "pages", fullSite: Boolean(plan.features.fullSite) },
      { key: "photos", count: plan.limits.photos ?? null },
      plan.features.customDomain ? { key: "domain" } : { key: "members", count: plan.limits.members ?? null },
    ];
  }
  const sms = plan.limits.smsPerMonth ?? 0;
  return [
    { key: "bookings", count: plan.limits.onlineBookingsPerMonth ?? null },
    { key: "members", count: plan.limits.members ?? null },
    sms > 0 ? { key: "sms", count: sms } : { key: "emailReminders" },
  ];
}

export function planItems(plans: ShowcasePlan[], index: number): ShowcaseItem[] {
  const plan = plans[index];
  const previous = index > 0 ? plans[index - 1] : null;
  const next = plans[index + 1] ?? null;
  // Un pack payant reprend le précédent (« Tout le pack … ») ; après un pack gratuit, on liste tout.
  const base = previous && previous.priceCents > 0 ? previous : null;
  const shown = (key: string) => planAllowsBooking(plan.features) || !BOOKING_KEYS.has(key);
  const gained = (key: string) => shown(key) && Boolean(plan.features[key]) && !base?.features[key];
  const items: ShowcaseItem[] = [];

  if (base) items.push({ kind: "everythingIn", planIndex: index - 1 });
  if (!previous) {
    if (!plan.features.fullSite) {
      // Site seul : une vraie page vitrine ; avec réservation : la fiche du pack gratuit.
      items.push({ kind: "included", key: planAllowsBooking(plan.features) ? "basePage" : "onePage" });
    }
    if (planAllowsBooking(plan.features)) items.push({ kind: "included", key: "agenda" });
    const { photos, services } = plan.limits;
    if (!unlimited(photos) && !unlimited(services)) {
      items.push({
        kind: "included",
        key: "photosServices",
        values: { photos: photos!, services: services! },
      });
    }
  }
  // Rappels par e-mail illimités : sur chaque pack avec réservation, même ceux qui reprennent le précédent.
  if (planAllowsBooking(plan.features)) items.push({ kind: "included", key: "emailReminders" });
  const rows: readonly ShowcaseKey[] = planAllowsBooking(plan.features) ? ROW_KEYS : SITE_ROW_KEYS;
  for (const key of rows) {
    if (key === "photosLimit") {
      // Limite de photos plus haute que le pack précédent, mais pas illimitée : annoncée.
      const photos = plan.limits.photos;
      if (previous && !unlimited(photos) && photos !== previous.limits.photos) {
        items.push({ kind: "included", key, values: { photos: photos! } });
      }
    } else if (key === "unlimitedPhotos") {
      if (base && unlimited(plan.limits.photos) && !unlimited(base.limits.photos)) {
        items.push({ kind: "included", key });
      }
    } else if (key === "stats" && gained("stats") && gained("monthlySummary")) {
      items.push({ kind: "included", key: "statsSummary" });
    } else if (gained(key) && !(key === "monthlySummary" && gained("stats"))) {
      items.push({ kind: "included", key });
    }
  }

  for (const key of SOON_KEYS) {
    if (plan.features[key]) items.push({ kind: "soon", key });
  }

  if (next) {
    MISSING_KEYS.filter((key) => shown(key) && next.features[key] && !plan.features[key])
      .slice(0, MAX_MISSING)
      .forEach((key) => items.push({ kind: "missing", key }));
  }
  if (planAllowsBooking(plan.features) && (plan.limits.smsPerMonth ?? 0) === 0) {
    items.push({ kind: "missing", key: "smsReminders" });
  }
  return items;
}

/**
 * Packs avec réservation d'un côté, « site seul » de l'autre (chacun dans son
 * ordre) : le pack « site seul » de rang n se présente au dos du pack de rang n.
 */
export function splitPlans<T extends { features: PlanFeatures }>(plans: T[]) {
  return {
    booking: plans.filter((plan) => planAllowsBooking(plan.features)),
    siteOnly: plans.filter((plan) => !planAllowsBooking(plan.features)),
  };
}
