import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { planAllowsBooking } from "./features";

/**
 * Présentation des packs sur le site commercial, calculée à partir de leurs
 * réglages (jamais écrite dans le code) :
 * - trois chiffres clés (réservations, membres, SMS ou rappels par e-mail) ;
 * - les lignes visibles de la carte (6 au plus), choisies dans l'admin ;
 * - la liste complète, dépliable, rangée en six groupes pour les packs
 *   d'accompagnement (Signature, Sérénité), puis ce qui manque par rapport au
 *   pack suivant de la même famille ;
 * - l'étiquette « Bientôt » sur une fonction pas encore livrée (réglage
 *   « features_soon ») : rien n'est promis avant d'exister.
 */

export type ShowcasePlan = {
  code: string;
  limits: PlanLimits;
  features: PlanFeatures;
  priceCents: number;
  highlights?: string[];
  bookingTwinCode?: string | null;
};

export type ShowcaseTile =
  | { key: "bookings" | "members" | "photos"; count: number | null }
  | { key: "sms" | "pageCount"; count: number }
  | { key: "emailReminders" }
  | { key: "pages"; fullSite: boolean }
  | { key: "domain" };

/** Une ligne à traduire : sa clé, ses valeurs (lues dans les réglages) et son état. */
export type ShowcaseLine = {
  key: string;
  values?: Record<string, number | string>;
  /** Fonction annoncée, pas encore livrée. */
  soon: boolean;
};

/** Les six groupes de la liste détaillée des packs d'accompagnement, dans l'ordre. */
export const SHOWCASE_GROUPS = ["style", "google", "requests", "languages", "tech", "care"] as const;
export type ShowcaseGroup = (typeof SHOWCASE_GROUPS)[number];

type Check = (plan: ShowcasePlan) => boolean;
type Values = (plan: ShowcasePlan) => Record<string, number | string>;
type LineDef = {
  key: string;
  group: ShowcaseGroup;
  when: Check;
  /** Fonction à surveiller pour l'étiquette « Bientôt ». */
  soon?: keyof PlanFeatures;
  /** Variante « illimité » de la ligne quand la limite est vide. */
  values?: Values;
  unlimited?: (plan: ShowcasePlan) => boolean;
};

const has =
  (...keys: (keyof PlanFeatures)[]): Check =>
  (plan) =>
    keys.every((key) => Boolean(plan.features[key]));
const booking: Check = (plan) => planAllowsBooking(plan.features);
const unlimited = (value: number | null | undefined) => value === null || value === undefined;

/** Lignes de la liste complète, dans l'ordre d'affichage (et rangées par groupe). */
const LINES: LineDef[] = [
  // 1. Un site pensé avec vous
  { key: "kickoffCall", group: "style", when: has("kickoffCall") },
  { key: "yourStyle", group: "style", when: has("kickoffCall") },
  { key: "copywriting", group: "style", when: has("copywriting") },
  { key: "photoRetouch", group: "style", when: has("photoRetouch") },
  { key: "businessSections", group: "style", when: has("businessSections"), soon: "businessSections" },
  { key: "basePage", group: "style", when: (plan) => booking(plan) && !plan.features.fullSite },
  { key: "onePage", group: "style", when: (plan) => !booking(plan) && !plan.features.fullSite },
  { key: "fullSite", group: "style", when: has("fullSite") },
  { key: "sitePages", group: "style", when: has("sitePages") },
  {
    key: "photos",
    group: "style",
    when: () => true,
    values: (plan) => ({ count: plan.limits.photos ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.photos),
  },
  {
    key: "services",
    group: "style",
    when: () => true,
    values: (plan) => ({ count: plan.limits.services ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.services),
  },
  // 2. Être trouvé sur Google
  { key: "localSeo", group: "google", when: has("localSeo") },
  { key: "seoPages", group: "google", when: has("seoPages"), soon: "seoPages" },
  { key: "searchConsole", group: "google", when: has("searchConsole") },
  { key: "googleBusiness", group: "google", when: has("googleBusiness") },
  { key: "googleReviews", group: "google", when: has("googleReviews") },
  { key: "visibilityReport", group: "google", when: has("visibilityReport"), soon: "visibilityReport" },
  // 3. Recevoir des demandes et des paiements (et les rendez-vous)
  {
    key: "bookings",
    group: "requests",
    when: booking,
    values: (plan) => ({ count: plan.limits.onlineBookingsPerMonth ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.onlineBookingsPerMonth),
  },
  { key: "agenda", group: "requests", when: booking },
  { key: "emailReminders", group: "requests", when: booking },
  {
    key: "sms",
    group: "requests",
    when: (plan) => booking(plan) && (plan.limits.smsPerMonth ?? 0) > 0,
    values: (plan) => ({ count: plan.limits.smsPerMonth ?? 0 }),
  },
  { key: "onlinePayment", group: "requests", when: (plan) => booking(plan) && has("onlinePayment")(plan) },
  { key: "promoCodes", group: "requests", when: (plan) => booking(plan) && has("promoCodes")(plan) },
  { key: "customerSpace", group: "requests", when: (plan) => booking(plan) && has("customerSpace")(plan) },
  { key: "contactForm", group: "requests", when: has("contactForm"), soon: "contactForm" },
  { key: "contactButtons", group: "requests", when: has("contactButtons") },
  { key: "paymentLinks", group: "requests", when: has("paymentLinks"), soon: "paymentLinks" },
  { key: "giftCards", group: "requests", when: has("giftCards") },
  { key: "promotions", group: "requests", when: has("promotions") },
  { key: "testimonials", group: "requests", when: has("testimonials") },
  // 4. Un site en plusieurs langues
  { key: "multilingual", group: "languages", when: has("multilingual"), soon: "multilingual" },
  // 5. La technique, sans y penser
  { key: "customDomain", group: "tech", when: has("customDomain") },
  { key: "mobileReady", group: "tech", when: has("mobileReady") },
  { key: "backups", group: "tech", when: has("kickoffCall") },
  { key: "legalPages", group: "tech", when: has("kickoffCall") },
  // 6. Nous nous occupons de tout
  { key: "monthlyUpdate", group: "care", when: has("monthlyUpdate") },
  { key: "onDemandUpdates", group: "care", when: has("onDemandUpdates") },
  { key: "whatsappSupport", group: "care", when: has("whatsappSupport") },
  {
    key: "members",
    group: "care",
    when: booking,
    values: (plan) => ({ count: plan.limits.members ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.members),
  },
  { key: "stats", group: "care", when: has("stats") },
  { key: "monthlySummary", group: "care", when: (plan) => booking(plan) && has("monthlySummary")(plan) },
  { key: "loyalty", group: "care", when: (plan) => booking(plan) && has("loyalty")(plan) },
  { key: "qrPoster", group: "care", when: has("qrPoster"), soon: "qrPoster" },
];

/**
 * Lignes que l'admin peut choisir pour la carte d'un pack (6 au plus). Chaque
 * ligne résume une fonction ; elle n'apparaît que si le pack l'a vraiment.
 * « everythingIn:<code> » : « Tout le pack … ».
 */
const HIGHLIGHTS: Omit<LineDef, "group">[] = [
  { key: "basePage", when: (plan) => booking(plan) && !plan.features.fullSite },
  { key: "onePage", when: (plan) => !booking(plan) && !plan.features.fullSite },
  { key: "fullSite", when: has("fullSite") },
  { key: "customDomain", when: has("customDomain") },
  { key: "contactButtons", when: has("contactButtons") },
  {
    key: "photosServices",
    when: (plan) => !unlimited(plan.limits.photos) && !unlimited(plan.limits.services),
    values: (plan) => ({ photos: plan.limits.photos ?? 0, services: plan.limits.services ?? 0 }),
  },
  {
    key: "photos",
    when: () => true,
    values: (plan) => ({ count: plan.limits.photos ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.photos),
  },
  { key: "monthlyUpdate", when: has("monthlyUpdate") },
  { key: "hosting", when: has("mobileReady") },
  { key: "contactForm", when: has("contactForm"), soon: "contactForm" },
  { key: "promotionsTestimonials", when: has("promotions", "testimonials") },
  { key: "withYou", when: has("kickoffCall", "copywriting") },
  { key: "google", when: has("localSeo", "googleBusiness") },
  { key: "cardPayment", when: has("paymentLinks"), soon: "paymentLinks" },
  { key: "multilingual", when: has("multilingual"), soon: "multilingual" },
  { key: "careUpdates", when: has("onDemandUpdates", "whatsappSupport") },
  {
    key: "bookings",
    when: booking,
    values: (plan) => ({ count: plan.limits.onlineBookingsPerMonth ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.onlineBookingsPerMonth),
  },
  { key: "agenda", when: booking },
  { key: "emailReminders", when: booking },
  { key: "onlinePayment", when: (plan) => booking(plan) && has("onlinePayment")(plan) },
  {
    key: "sms",
    when: (plan) => booking(plan) && (plan.limits.smsPerMonth ?? 0) > 0,
    values: (plan) => ({ count: plan.limits.smsPerMonth ?? 0 }),
  },
  { key: "customerSpace", when: (plan) => booking(plan) && has("customerSpace")(plan) },
  {
    key: "members",
    when: booking,
    values: (plan) => ({ count: plan.limits.members ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.members),
  },
  { key: "loyalty", when: (plan) => booking(plan) && has("loyalty")(plan) },
  { key: "stats", when: has("stats") },
  { key: "giftCards", when: has("giftCards") },
  { key: "googleReviews", when: has("googleReviews") },
  // Packs à options (Essentiel, Business, Premium).
  {
    key: "pages",
    when: (plan) => typeof plan.limits.pages === "number",
    values: (plan) => ({ count: plan.limits.pages ?? 0 }),
  },
  { key: "gallery", when: has("gallery") },
  { key: "selfEditing", when: has("selfEditing") },
  { key: "localSeo", when: has("localSeo") },
  { key: "advancedBranding", when: has("advancedBranding"), soon: "advancedBranding" },
  { key: "premiumBranding", when: has("premiumBranding"), soon: "premiumBranding" },
  { key: "advancedStats", when: has("advancedStats"), soon: "advancedStats" },
  { key: "advancedSeo", when: has("advancedSeo"), soon: "advancedSeo" },
  { key: "richContent", when: has("richContent") },
  { key: "advancedPresentation", when: has("advancedPresentation"), soon: "advancedPresentation" },
  { key: "prioritySupport", when: has("prioritySupport") },
  { key: "dedicatedSupport", when: has("dedicatedSupport") },
];

/** Clés proposées dans l'admin pour les lignes visibles d'une carte. */
export const HIGHLIGHT_KEYS = HIGHLIGHTS.map((item) => item.key);
export const EVERYTHING_IN = "everythingIn:";
export const MAX_HIGHLIGHTS = 6;

/** Ce qui manque à un pack par rapport au suivant de sa famille (3 lignes au plus). */
const MISSING_KEYS = [
  "customDomain",
  "fullSite",
  "contactForm",
  "onlinePayment",
  "sms",
  "kickoffCall",
  "googleReviews",
  "stats",
  "whatsappSupport",
];
const MAX_MISSING = 3;

function line(def: Omit<LineDef, "group">, plan: ShowcasePlan, soon: ReadonlySet<string>): ShowcaseLine {
  const isUnlimited = def.unlimited?.(plan) ?? false;
  return {
    key: isUnlimited ? `${def.key}Unlimited` : def.key,
    values: isUnlimited ? undefined : def.values?.(plan),
    soon: Boolean(def.soon && soon.has(String(def.soon))),
  };
}

/** Lignes visibles de la carte, dans l'ordre choisi (celles que le pack n'a pas sont écartées). */
export function planHighlights(
  plan: ShowcasePlan,
  plans: ShowcasePlan[],
  soon: ReadonlySet<string>,
): ShowcaseLine[] {
  return (plan.highlights ?? [])
    .slice(0, MAX_HIGHLIGHTS)
    .map((key): ShowcaseLine | null => {
      if (key.startsWith(EVERYTHING_IN)) {
        const code = key.slice(EVERYTHING_IN.length);
        return plans.some((item) => item.code === code && item.code !== plan.code)
          ? { key: "everythingIn", values: { planCode: code }, soon: false }
          : null;
      }
      const def = HIGHLIGHTS.find((item) => item.key === key);
      return def && def.when(plan) ? line(def, plan, soon) : null;
    })
    .filter((item): item is ShowcaseLine => item !== null);
}

/** Packs de la même famille (avec ou sans réservation), dans leur ordre. */
function familyOf<T extends ShowcasePlan>(plan: T, plans: T[]) {
  const withBooking = planAllowsBooking(plan.features);
  return plans.filter((item) => planAllowsBooking(item.features) === withBooking);
}

/**
 * Liste complète du pack : rangée en six groupes pour les packs
 * d'accompagnement (échange de départ inclus), liste simple sinon ; puis ce
 * qui lui manque par rapport au pack suivant de sa famille.
 */
export function planFullList(plan: ShowcasePlan, plans: ShowcasePlan[], soon: ReadonlySet<string>) {
  const included = LINES.filter((def) => def.when(plan));
  const grouped = Boolean(plan.features.kickoffCall);
  const groups = grouped
    ? SHOWCASE_GROUPS.map((group) => ({
        group,
        lines: included.filter((def) => def.group === group).map((def) => line(def, plan, soon)),
      })).filter((item) => item.lines.length > 0)
    : [{ group: null, lines: included.map((def) => line(def, plan, soon)) }];
  const family = familyOf(plan, plans);
  const next = family[family.findIndex((item) => item.code === plan.code) + 1];
  const missing = next
    ? LINES.filter((def) => MISSING_KEYS.includes(def.key) && def.when(next) && !def.when(plan))
        .slice(0, MAX_MISSING)
        .map((def) => ({ key: def.key, values: def.values?.(next), soon: false }))
    : [];
  return { grouped, groups, missing };
}

/** Toutes les lignes possibles de la liste complète (tableau comparatif). */
export function comparisonLines(plans: ShowcasePlan[], soon: ReadonlySet<string>) {
  return LINES.filter((def) => plans.some((plan) => def.when(plan))).map((def) => ({
    key: def.key,
    group: def.group,
    soon: Boolean(def.soon && soon.has(String(def.soon))),
    /** Ligne chiffrée (photos, réservations…) : la case donne le nombre, sinon une coche. */
    valued: Boolean(def.values),
    cells: plans.map((plan) => (def.when(plan) ? line(def, plan, soon) : null)),
  }));
}

export function planTiles(plan: ShowcasePlan): ShowcaseTile[] {
  // Packs à options : nombre de pages, photos, nom de domaine.
  if (!planAllowsBooking(plan.features) && typeof plan.limits.pages === "number") {
    return [
      { key: "pageCount", count: plan.limits.pages },
      { key: "photos", count: plan.limits.photos ?? null },
      plan.features.customDomain ? { key: "domain" } : { key: "members", count: plan.limits.members ?? null },
    ];
  }
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

/** Pack avec réservation qui reprend un pack « site seul » (« Pour ajouter la réservation »). */
export function bookingTwinOf<T extends ShowcasePlan>(plan: T, plans: T[]) {
  return plan.bookingTwinCode ? (plans.find((item) => item.code === plan.bookingTwinCode) ?? null) : null;
}

const LIMIT_KEYS = ["photos", "services", "members"] as const;

/**
 * Règle des jumeaux : tout ce qu'un pack « site seul » comprend, son jumeau
 * avec réservation le comprend aussi (fonctions, et limites au moins aussi
 * hautes). Renvoie les écarts trouvés, vides si la grille est cohérente.
 */
export function twinRuleViolations(plans: ShowcasePlan[]): string[] {
  const problems: string[] = [];
  // Seuls les packs « site seul » rattachés à un jumeau sont concernés (les packs à options n'en ont pas).
  for (const plan of plans.filter((item) => !planAllowsBooking(item.features) && item.bookingTwinCode)) {
    const twin = bookingTwinOf(plan, plans);
    if (!twin || !planAllowsBooking(twin.features)) {
      problems.push(`${plan.code} : aucun jumeau avec réservation`);
      continue;
    }
    for (const [key, value] of Object.entries(plan.features)) {
      if (value && key !== "onlineBooking" && !twin.features[key])
        problems.push(`${plan.code} → ${twin.code} : ${key}`);
    }
    for (const key of LIMIT_KEYS) {
      const own = plan.limits[key];
      const theirs = twin.limits[key];
      if (!unlimited(theirs) && (unlimited(own) || own! > theirs!))
        problems.push(`${plan.code} → ${twin.code} : ${key}`);
    }
  }
  return problems;
}
