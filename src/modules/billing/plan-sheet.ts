import type { PlanFeatures } from "@/db/schema";
import type { ShowcaseLine, ShowcasePlan } from "./showcase";

/**
 * Fiche détaillée d'un pack (verso des cartes, tableau comparatif) : des
 * rubriques courtes, calculées à partir des réglages du pack. Une fonction pas
 * encore livrée (réglage « features_soon ») porte l'étiquette « Bientôt ».
 */

export const SHEET_SECTIONS = ["site", "branding", "management", "visibility", "hosting", "support"] as const;
export type SheetSection = (typeof SHEET_SECTIONS)[number];

type SheetLine = {
  key: string;
  section: SheetSection;
  when: (plan: ShowcasePlan) => boolean;
  values?: (plan: ShowcasePlan) => Record<string, number | string>;
  /** Variante « illimité » quand la limite est vide. */
  unlimited?: (plan: ShowcasePlan) => boolean;
  soon?: keyof PlanFeatures;
};

const has =
  (...keys: (keyof PlanFeatures)[]) =>
  (plan: ShowcasePlan) =>
    keys.every((key) => Boolean(plan.features[key]));
const always = () => true;
const unlimited = (value: number | null | undefined) => value === null || value === undefined;

/** Lignes du verso ; photos et nom de domaine sont déjà dans les chiffres clés du recto. */
const LINES: SheetLine[] = [
  {
    key: "pages",
    section: "site",
    when: always,
    values: (plan) => ({ count: plan.limits.pages ?? 0 }),
    unlimited: (plan) => unlimited(plan.limits.pages),
  },
  { key: "responsive", section: "site", when: has("mobileReady") },
  { key: "gallery", section: "site", when: has("gallery") },
  { key: "contactForm", section: "site", when: has("contactForm"), soon: "contactForm" },
  { key: "brandingBase", section: "branding", when: always },
  { key: "advancedBranding", section: "branding", when: has("advancedBranding"), soon: "advancedBranding" },
  { key: "premiumBranding", section: "branding", when: has("premiumBranding"), soon: "premiumBranding" },
  {
    key: "advancedPresentation",
    section: "branding",
    when: has("advancedPresentation"),
    soon: "advancedPresentation",
  },
  { key: "selfEditing", section: "management", when: has("selfEditing") },
  { key: "richContent", section: "management", when: has("richContent") },
  { key: "stats", section: "management", when: has("stats") },
  { key: "advancedStats", section: "management", when: has("advancedStats"), soon: "advancedStats" },
  { key: "localSeo", section: "visibility", when: has("localSeo") },
  { key: "advancedSeo", section: "visibility", when: has("advancedSeo"), soon: "advancedSeo" },
  { key: "hosting", section: "hosting", when: has("mobileReady") },
  { key: "maintenance", section: "hosting", when: always },
  { key: "standardSupport", section: "support", when: (plan) => !plan.features.prioritySupport },
  { key: "prioritySupport", section: "support", when: has("prioritySupport") },
  { key: "dedicatedSupport", section: "support", when: has("dedicatedSupport") },
];

function toLine(def: SheetLine, plan: ShowcasePlan, soon: ReadonlySet<string>): ShowcaseLine {
  const isUnlimited = def.unlimited?.(plan) ?? false;
  return {
    key: isUnlimited ? `${def.key}Unlimited` : def.key,
    values: isUnlimited ? undefined : def.values?.(plan),
    soon: Boolean(def.soon && soon.has(String(def.soon))),
  };
}

/**
 * Rubriques du verso, sans les rubriques vides. Avec le pack précédent de la
 * grille, seules les différences sont listées (« Tout le pack Essentiel, plus : ») :
 * le verso reste court, le tableau comparatif donne tout.
 */
export function planSheet(plan: ShowcasePlan, soon: ReadonlySet<string>, previous?: ShowcasePlan) {
  const same = (def: SheetLine) =>
    previous !== undefined &&
    def.when(previous) &&
    JSON.stringify(toLine(def, previous, soon)) === JSON.stringify(toLine(def, plan, soon));
  return SHEET_SECTIONS.map((section) => ({
    section,
    lines: LINES.filter((def) => def.section === section && def.when(plan) && !same(def)).map((def) =>
      toLine(def, plan, soon),
    ),
  })).filter((item) => item.lines.length > 0);
}

/** Tableau comparatif : chaque ligne, et pour chaque pack la ligne (ou null s'il ne l'a pas). */
export function sheetComparison(plans: ShowcasePlan[], soon: ReadonlySet<string>) {
  return LINES.filter((def) => plans.some((plan) => def.when(plan))).map((def) => ({
    key: def.key,
    section: def.section,
    soon: Boolean(def.soon && soon.has(String(def.soon))),
    valued: Boolean(def.values),
    cells: plans.map((plan) => (def.when(plan) ? toLine(def, plan, soon) : null)),
  }));
}
