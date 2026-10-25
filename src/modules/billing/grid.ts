import type { PlanFeatures, PlanLimits } from "@/db/schema";

/**
 * Catalogue unique de ce que comprennent les packs : il alimente les cartes
 * des packs ET le tableau comparatif, à partir des réglages des packs
 * (fonctions et quotas en base). Aucun prix ni quota n'est écrit ici.
 * - Une ligne « feature » est incluse si le pack a la fonction.
 * - Une ligne « limit » donne le quota (null : illimité ; 0 : non inclus).
 * - « solution » : la ligne ne concerne qu'une solution (Réservation,
 *   Commerce, Formation) ; sans solution, elle concerne les trois.
 * - « soon » : fonction annoncée mais pas livrée (réglage features_soon).
 */

export const GRID_CATEGORIES = [
  "site",
  "booking",
  "commerce",
  "formation",
  "crm",
  "marketing",
  "payments",
  "ai",
  "messaging",
  "stats",
  "hosting",
  "support",
] as const;
export type GridCategory = (typeof GRID_CATEGORIES)[number];

export const SOLUTIONS = ["booking", "commerce", "formation"] as const;
export type Solution = (typeof SOLUTIONS)[number];

type GridPlan = { code: string; features: PlanFeatures; limits: PlanLimits };

type RowDef = {
  key: string;
  category: GridCategory;
  solution?: Solution;
  /** Fonction qui décide de l'inclusion (et de « Disponible bientôt »). */
  feature?: keyof PlanFeatures;
  /** Quota affiché (la fonction, si elle est donnée, doit aussi être incluse). */
  limit?: keyof PlanLimits;
  /** Inclus dans tous les packs, sans réglage (ex. sous-domaine). */
  always?: boolean;
  /** Inclus seulement si la fonction est absente. */
  unless?: keyof PlanFeatures;
  /** Ligne détaillée, affichée dans le comparatif mais pas sur les cartes. */
  detail?: boolean;
};

const ROWS: RowDef[] = [
  // Site web et présence en ligne
  // Site vitrine : remplacé par le site multipage quand le pack l'inclut.
  { key: "miniSite", category: "site", always: true, unless: "fullSite" },
  { key: "fullSite", category: "site", feature: "fullSite" },
  { key: "setupAssistance", category: "site", feature: "setupAssistance" },
  { key: "photos", category: "site", limit: "photos", always: true },
  { key: "services", category: "site", limit: "services", always: true },
  { key: "localSeo", category: "site", feature: "localSeo" },
  { key: "favicon", category: "site", feature: "logoCreation" },
  { key: "responsive", category: "site", feature: "mobileReady" },
  { key: "advancedSeo", category: "site", feature: "advancedSeo" },
  { key: "multilingual", category: "site", feature: "multilingual" },
  // Réservations et agenda
  {
    key: "bookings",
    category: "booking",
    solution: "booking",
    feature: "onlineBooking",
    limit: "onlineBookingsPerMonth",
  },
  { key: "agenda", category: "booking", solution: "booking", feature: "onlineBooking" },
  { key: "bookingLink", category: "booking", solution: "booking", feature: "onlineBooking", detail: true },
  { key: "staffPlanning", category: "booking", solution: "booking", feature: "staffPlanning" },
  { key: "customerSpace", category: "booking", solution: "booking", feature: "customerSpace", detail: true },
  // Commerce et Formation : modules en préparation
  { key: "commerce", category: "commerce", solution: "commerce", feature: "commerce" },
  { key: "formation", category: "formation", solution: "formation", feature: "formation" },
  // Clients et collaborateurs
  { key: "customers", category: "crm", limit: "customers", always: true },
  { key: "members", category: "crm", limit: "members", always: true },
  { key: "customerFile", category: "crm", feature: "customerFile", detail: true },
  { key: "advancedCrm", category: "crm", feature: "advancedCrm" },
  // Marketing et fidélisation
  { key: "promoCodes", category: "marketing", feature: "promoCodes" },
  { key: "googleReviews", category: "marketing", feature: "googleReviews" },
  { key: "loyalty", category: "marketing", feature: "loyalty" },
  { key: "giftCards", category: "marketing", feature: "giftCards" },
  { key: "marketingAutomation", category: "marketing", feature: "marketingAutomation" },
  // Paiements
  { key: "onlinePayment", category: "payments", feature: "onlinePayment" },
  // Intelligence artificielle
  { key: "aiChatbot", category: "ai", feature: "aiChatbot", limit: "aiChatConversations" },
  { key: "aiTexts", category: "ai", feature: "aiTexts", limit: "aiTexts" },
  { key: "aiImages", category: "ai", feature: "aiImages", limit: "aiImages" },
  // WhatsApp et SMS
  { key: "emailReminders", category: "messaging", feature: "onlineBooking" },
  { key: "sms", category: "messaging", limit: "smsPerMonth", always: true },
  { key: "whatsapp", category: "messaging", feature: "whatsappAssistant", limit: "whatsappConversations" },
  // Statistiques
  { key: "basicStats", category: "stats", always: true },
  { key: "stats", category: "stats", feature: "stats" },
  { key: "reports", category: "stats", feature: "monthlySummary" },
  // Hébergement et domaines
  { key: "hosting", category: "hosting", feature: "mobileReady" },
  { key: "subdomain", category: "hosting", always: true, detail: true },
  { key: "customDomain", category: "hosting", feature: "customDomain" },
  { key: "freeDomain", category: "hosting", feature: "freeDomain" },
  { key: "security", category: "hosting", feature: "securityProtection" },
  { key: "maintenance", category: "hosting", feature: "maintenance" },
  // Assistance
  { key: "helpCenter", category: "support", feature: "helpCenter", detail: true },
  { key: "technicalSupport247", category: "support", feature: "technicalSupport247" },
  { key: "whatsappSupport", category: "support", feature: "whatsappSupport" },
  { key: "ticketSupport", category: "support", feature: "ticketSupport" },
  { key: "priorityHumanSupport", category: "support", feature: "priorityHumanSupport" },
];

/** Valeur d'une case : non inclus, inclus, ou un quota (null = illimité). */
export type GridCell = { included: false } | { included: true; count?: number | null };

function cellOf(def: RowDef, plan: GridPlan): GridCell {
  if (def.unless && plan.features[def.unless]) return { included: false };
  if (def.feature && !plan.features[def.feature]) return { included: false };
  if (!def.feature && !def.always) return { included: false };
  if (!def.limit) return { included: true };
  const value = plan.limits[def.limit];
  // Quota à 0 : non inclus (ex. SMS du Basic).
  if (value === 0) return { included: false };
  return { included: true, count: value ?? null };
}

const sameCell = (a: GridCell, b: GridCell) => JSON.stringify(a) === JSON.stringify(b);

export type GridRow = {
  key: string;
  category: GridCategory;
  solution: Solution | null;
  soon: boolean;
  cells: GridCell[];
};

/** Tableau comparatif : lignes rangées par catégorie, une case par pack. */
export function gridComparison(plans: GridPlan[], soon: ReadonlySet<string>) {
  const rows: GridRow[] = ROWS.map((def) => ({
    key: def.key,
    category: def.category,
    solution: def.solution ?? null,
    soon: Boolean(def.feature && soon.has(String(def.feature))),
    cells: plans.map((plan) => cellOf(def, plan)),
  })).filter((row) => row.cells.some((cell) => cell.included));
  return GRID_CATEGORIES.map((category) => ({
    category,
    rows: rows.filter((row) => row.category === category),
  })).filter((group) => group.rows.length > 0);
}

export type CardLine = { key: string; count?: number | null; soon: boolean; solution: Solution | null };

const MAX_MISSING = 3;

/**
 * Contenu d'une carte : « Tout le pack précédent », puis ce que le pack
 * ajoute (ou améliore), les fonctions annoncées à part ; et ce qui lui manque
 * par rapport au pack suivant (« Non inclus », 3 lignes au plus). Les lignes
 * de détail ne figurent que dans le comparatif.
 */
export function gridCard(plan: GridPlan, plans: GridPlan[], soon: ReadonlySet<string>) {
  const index = plans.findIndex((item) => item.code === plan.code);
  const previous = index > 0 ? plans[index - 1] : undefined;
  const next = plans[index + 1];
  const line = (def: RowDef, target: GridPlan): CardLine => {
    const cell = cellOf(def, target);
    return {
      key: def.key,
      count: cell.included ? cell.count : undefined,
      soon: Boolean(def.feature && soon.has(String(def.feature))),
      solution: def.solution ?? null,
    };
  };
  const added = ROWS.filter((def) => {
    if (def.detail) return false;
    const cell = cellOf(def, plan);
    return cell.included && (!previous || !sameCell(cell, cellOf(def, previous)));
  }).map((def) => line(def, plan));
  const missing = next
    ? ROWS.filter((def) => !def.detail && !cellOf(def, plan).included && cellOf(def, next).included)
        .map((def) => line(def, next))
        .filter((item) => !item.soon)
        .slice(0, MAX_MISSING)
    : [];
  return {
    previous: previous?.code ?? null,
    /** Disponible aujourd'hui. */
    included: added.filter((item) => !item.soon),
    /** Annoncé (« Bientôt »), présenté à part. */
    upcoming: added.filter((item) => item.soon),
    missing,
  };
}
