import type { PlanFeatures, PlanLimits } from "@/db/schema";

/**
 * Présentation des packs sur le site commercial, calculée à partir de leurs
 * limites et de leurs fonctions (jamais écrites dans le code) :
 * - trois chiffres clés (réservations, membres, SMS ou rappels par e-mail) ;
 * - la liste de ce que le pack ajoute au précédent, puis ce qui lui manque
 *   par rapport au suivant.
 */

type ShowcasePlan = { limits: PlanLimits; features: PlanFeatures; priceCents: number };

export type ShowcaseTile =
  | { key: "bookings" | "members"; count: number | null }
  | { key: "sms"; count: number }
  | { key: "emailReminders" };

export type ShowcaseItem =
  | { kind: "included"; key: ShowcaseKey; values?: Record<string, number> }
  | { kind: "everythingIn"; planIndex: number }
  | { kind: "missing"; key: ShowcaseKey };

export type ShowcaseKey =
  (typeof ROW_KEYS)[number] | "basePage" | "agenda" | "photosServices" | "statsSummary" | "smsReminders";

/** Fonctions présentées, dans l'ordre d'affichage. */
const ROW_KEYS = [
  "fullSite",
  "customDomain",
  "onlinePayment",
  "promoCodes",
  "monthlyUpdate",
  "onDemandUpdates",
  "unlimitedPhotos",
  "stats",
  "monthlySummary",
  "googleReviews",
  "whatsappSupport",
  "giftCards",
] as const;

/** Ce qui manque au pack, par rapport au suivant (deux au plus). */
const MISSING_KEYS = ["customDomain", "onlinePayment", "stats", "whatsappSupport"] as const;
const MAX_MISSING = 2;

const unlimited = (value: number | null | undefined) => value === null || value === undefined;

export function planTiles(plan: ShowcasePlan): ShowcaseTile[] {
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
  const gained = (key: string) => Boolean(plan.features[key]) && !base?.features[key];
  const items: ShowcaseItem[] = [];

  if (base) items.push({ kind: "everythingIn", planIndex: index - 1 });
  if (!previous) {
    if (!plan.features.fullSite) items.push({ kind: "included", key: "basePage" });
    items.push({ kind: "included", key: "agenda" });
    const { photos, services } = plan.limits;
    if (!unlimited(photos) && !unlimited(services)) {
      items.push({
        kind: "included",
        key: "photosServices",
        values: { photos: photos!, services: services! },
      });
    }
  }
  for (const key of ROW_KEYS) {
    if (key === "unlimitedPhotos") {
      if (base && unlimited(plan.limits.photos) && !unlimited(base.limits.photos)) {
        items.push({ kind: "included", key });
      }
    } else if (key === "stats" && gained("stats") && gained("monthlySummary")) {
      items.push({ kind: "included", key: "statsSummary" });
    } else if (gained(key) && !(key === "monthlySummary" && gained("stats"))) {
      items.push({ kind: "included", key });
    }
  }

  if (next) {
    MISSING_KEYS.filter((key) => next.features[key] && !plan.features[key])
      .slice(0, MAX_MISSING)
      .forEach((key) => items.push({ kind: "missing", key }));
  }
  if ((plan.limits.smsPerMonth ?? 0) === 0) items.push({ kind: "missing", key: "smsReminders" });
  return items;
}
