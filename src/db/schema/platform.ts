import { sql } from "drizzle-orm";
import { boolean, check, integer, jsonb, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { cents, currency, id, localized, timestamps, utc } from "./_helpers";

/**
 * Famille A : plateforme et configuration. Ces tables n'appartiennent à aucun tenant.
 */

/** Réglages généraux modifiables depuis l'espace admin (clé → valeur JSON). */
export const platformSettings = pgTable("platform_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  ...timestamps(),
});

export const billingIntervalEnum = pgEnum("billing_interval", ["month", "year"]);

/** Limites d'un pack. Une valeur absente ou null signifie « illimité ». */
export type PlanLimits = {
  onlineBookingsPerMonth?: number | null;
  members?: number | null;
  photos?: number | null;
  services?: number | null;
  smsPerMonth?: number | null;
};

/** Fonctions d'un pack. Une fonction absente est désactivée. */
export type PlanFeatures = {
  fullSite?: boolean;
  customDomain?: boolean;
  onlinePayment?: boolean;
  promoCodes?: boolean;
  testimonials?: boolean;
  stats?: boolean;
  monthlySummary?: boolean;
  brandingFooter?: boolean;
  emailSupport?: boolean;
  whatsappSupport?: boolean;
  /** Promotions datées (bandeau, prix barré). */
  promotions?: boolean;
  googleReviews?: boolean;
  giftCards?: boolean;
  /** Promesses de service affichées sur le site commercial (mises à jour du site faites pour la cliente). */
  monthlyUpdate?: boolean;
  onDemandUpdates?: boolean;
  /** Fonction annoncée « bientôt » sur le site commercial (pas encore disponible). */
  aiMessaging?: boolean;
  [feature: string]: boolean | undefined;
};

export const plans = pgTable(
  "plans",
  {
    id: id(),
    code: text().notNull(),
    name: localized().notNull(),
    description: localized(),
    priceCents: cents().notNull(),
    currency: currency().notNull().default("EUR"),
    interval: billingIntervalEnum().notNull().default("month"),
    stripePriceId: text(),
    /** Produit Stripe du pack (un nouveau prix y est ajouté à chaque changement de tarif). */
    stripeProductId: text(),
    limits: jsonb().$type<PlanLimits>().notNull().default({}),
    features: jsonb().$type<PlanFeatures>().notNull().default({}),
    isPublic: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("plans_code_key").on(t.code), check("plans_price_positive", sql`${t.priceCents} >= 0`)],
);

export const legalDocumentKeyEnum = pgEnum("legal_document_key", ["legal_notice", "privacy", "terms"]);

/** Documents légaux du SaaS, par langue et par version. */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: id(),
    key: legalDocumentKeyEnum().notNull(),
    locale: text().notNull(),
    version: integer().notNull().default(1),
    title: text().notNull(),
    content: text().notNull(),
    publishedAt: utc(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("legal_documents_key_locale_version_key").on(t.key, t.locale, t.version)],
);
