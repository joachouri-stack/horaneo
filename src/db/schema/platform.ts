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
  /** Nombre de pages du site annoncé par le pack. */
  pages?: number | null;
  /** Fiches clients (contacts) du site. */
  customers?: number | null;
  /** Quotas mensuels des outils intelligents (0 ou absent : non inclus). */
  aiChatConversations?: number | null;
  whatsappConversations?: number | null;
  aiTexts?: number | null;
  aiImages?: number | null;
};

/** Fonctions d'un pack. Une fonction absente est désactivée. */
export type PlanFeatures = {
  /**
   * Réservation en ligne incluse. Seul `false` la coupe (packs « site seul ») :
   * une valeur absente vaut « incluse », pour les packs créés avant ce réglage.
   */
  onlineBooking?: boolean;
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
  /** Espace des clientes sur le site (rendez-vous, historique, « Reprendre ce soin »). */
  customerSpace?: boolean;
  /** Programme de fidélité (compteur et bons) ; s'affiche aussi dans l'espace des clientes. */
  loyalty?: boolean;
  /** Promesses des packs « site seul », présentées sur le site commercial. */
  localSeo?: boolean;
  contactButtons?: boolean;
  mobileReady?: boolean;
  /** Pages Prestations, Galerie, À propos, Infos pratiques (site complet). */
  sitePages?: boolean;
  /** Formulaire de contact et de devis, avec envoi de photos. */
  contactForm?: boolean;
  /** Accompagnement : échange de départ pour définir le style, textes rédigés, photos retouchées. */
  kickoffCall?: boolean;
  copywriting?: boolean;
  photoRetouch?: boolean;
  /** Rubriques adaptées au métier : avant et après, zone d'intervention, actualités. */
  businessSections?: boolean;
  /** Référencement : une page par prestation, pages « métier + ville », Search Console, fiche Google Business. */
  seoPages?: boolean;
  searchConsole?: boolean;
  googleBusiness?: boolean;
  /** Rapport mensuel de visibilité par e-mail. */
  visibilityReport?: boolean;
  /** Paiement par carte hors réservation : lien de paiement, acompte sur devis, bouton « Payer en ligne ». */
  paymentLinks?: boolean;
  /** Site en plusieurs langues, traduit par nos soins. */
  multilingual?: boolean;
  /** Affichette avec QR code vers la page d'avis Google. */
  qrPoster?: boolean;
  /** Galerie photos du site et modification des contenus depuis le tableau de bord. */
  gallery?: boolean;
  selfEditing?: boolean;
  /** Personnalisation graphique : avancée (Business), premium (Premium). */
  advancedBranding?: boolean;
  premiumBranding?: boolean;
  /** Statistiques et référencement avancés, gestion enrichie des contenus. */
  advancedStats?: boolean;
  advancedSeo?: boolean;
  richContent?: boolean;
  /** Fonctionnalités de présentation avancées (Premium). */
  advancedPresentation?: boolean;
  /** Support prioritaire et accompagnement renforcé. */
  prioritySupport?: boolean;
  dedicatedSupport?: boolean;
  /** Grille Basic, Pro, Business. */
  helpCenter?: boolean;
  ticketSupport?: boolean;
  priorityHumanSupport?: boolean;
  setupAssistance?: boolean;
  freeDomain?: boolean;
  staffPlanning?: boolean;
  customerFile?: boolean;
  advancedCrm?: boolean;
  marketingAutomation?: boolean;
  aiChatbot?: boolean;
  whatsappAssistant?: boolean;
  aiTexts?: boolean;
  aiImages?: boolean;
  /** Accès aux modules Commerce et Formation (quand ils seront disponibles). */
  commerce?: boolean;
  formation?: boolean;
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
    /** Frais de création de la formule sans engagement, en centimes (avec engagement : création offerte). */
    noCommitmentFeeCents: cents(),
    /** Pack « site seul » : code du pack avec réservation qui le reprend (« Pour ajouter la réservation »). */
    bookingTwinCode: text(),
    /** Lignes visibles sur la carte du pack (6 au plus), dans l'ordre ; le reste se déplie. */
    highlights: jsonb().$type<string[]>().notNull().default([]),
    /** Produit Stripe du pack (un nouveau prix y est ajouté à chaque changement de tarif). */
    stripeProductId: text(),
    /** Prix Stripe annuel (facturation à l'année) et montant pour lequel il a été créé. */
    stripeYearlyPriceId: text(),
    stripeYearlyPriceCents: cents(),
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

/**
 * Options activables à la carte, en plus du pack (réservation, paiement en
 * ligne, rappels par SMS…). Chacune a son tarif mensuel (null : tarif pas
 * encore fixé, l'option ne se commande pas en ligne), ses fonctions et
 * limites ajoutées au pack, et les options dont elle a besoin.
 */
export const planOptions = pgTable(
  "plan_options",
  {
    id: id(),
    code: text().notNull(),
    name: localized().notNull(),
    description: localized(),
    /** Pictogramme du site commercial (clé de PLAN_OPTION_ICONS). */
    icon: text().notNull().default("spark"),
    /** Tarif mensuel en centimes ; null : tarif à définir dans l'admin. */
    priceCents: cents(),
    currency: currency().notNull().default("EUR"),
    /** Option proposée sur le site commercial et à la commande. */
    isActive: boolean().notNull().default(true),
    /** false : annoncée « Bientôt » (pas encore livrée), elle ne se commande pas. */
    isAvailable: boolean().notNull().default(true),
    /** Fonctions ajoutées au pack quand l'option est active. */
    features: jsonb().$type<PlanFeatures>().notNull().default({}),
    /** Limites ajoutées (remplacent celles du pack, ex. SMS par mois). */
    limits: jsonb().$type<PlanLimits>().notNull().default({}),
    /** Options nécessaires (codes) : ajoutées automatiquement au calcul du total. */
    requires: jsonb().$type<string[]>().notNull().default([]),
    stripeProductId: text(),
    stripePriceId: text(),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("plan_options_code_key").on(t.code),
    check("plan_options_price_positive", sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
  ],
);
