import { sql } from "drizzle-orm";
import {
  unique,
  foreignKey,
  boolean,
  check,
  char,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { LocalizedText } from "@/i18n/locales";
import { currency, id, timestamps, utc } from "./_helpers";
import { DEFAULT_BIRTHDAY_OFFER } from "../../config/defaults";
import { plans } from "./platform";

/**
 * Famille C : le tenant (un professionnel abonné) et ses réglages.
 */

export const tenantStatusEnum = pgEnum("tenant_status", [
  "draft",
  "active",
  "suspended",
  "cancelled",
  "deleted",
]);

export const siteThemeEnum = pgEnum("site_theme", ["light", "dark", "nature", "blush"]);

export type TenantBrand = {
  logoAssetId?: string | null;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  /** Pages des réseaux sociaux (adresses complètes). */
  social?: { instagram?: string; facebook?: string };
  /**
   * Bouton à côté de « Réserver » dans la barre du bas sur téléphone : appeler ou
   * envoyer un SMS, au numéro du site ou à un autre numéro.
   */
  contactBar?: { mode: "call" | "sms"; phone?: string | null };
};

/** Présentation publique d'une entreprise (sa page sur le site : « Esthétique, avec Laïla »). */
export type BusinessProfile = {
  /** Titre de sa page et du menu (ex. « Esthétique »). */
  title?: LocalizedText;
  /** Métier affiché sous le nom (ex. « Esthéticienne, spécialiste du regard »). */
  role?: LocalizedText;
  bio?: LocalizedText;
  /** Sa phrase, en citation sur l'accueil (ex. « Chaque cliente repart… »). */
  quote?: LocalizedText;
  /** Disponibilités en clair (ex. « Du lundi au samedi »). */
  availability?: LocalizedText;
  photoAssetId?: string | null;
  /** Nom de sa boutique, s'il diffère de son nom (ex. « Zen & Bien-être »). */
  shopName?: string | null;
  /** Son propre logo, à côté de son nom sur sa carte et sa page. */
  logoAssetId?: string | null;
  /** Ses propres pages Instagram et Facebook, affichées sur sa page. */
  social?: { instagram?: string; facebook?: string };
};

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: text().notNull(),
    /** Enseigne affichée sur le site (une ou plusieurs entreprises derrière). */
    name: text().notNull(),
    status: tenantStatusEnum().notNull().default("draft"),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),

    // International
    country: char({ length: 2 }).notNull().default("FR"),
    defaultLocale: text().notNull().default("fr"),
    enabledLocales: text()
      .array()
      .notNull()
      .default(sql`ARRAY['fr']::text[]`),
    currency: currency().notNull().default("EUR"),
    timezone: text().notNull().default("Europe/Paris"),

    // Infos pratiques
    phone: text(),
    email: text(),
    addressLine1: text(),
    addressLine2: text(),
    postalCode: text(),
    city: text(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),

    // Modèle et apparence (configuration, jamais de règle « si métier = … »)
    businessCategory: text(),
    templateKey: text().notNull().default("wellness"),
    theme: siteThemeEnum().notNull().default("light"),
    brand: jsonb().$type<TenantBrand>().notNull().default({}),

    // Cycle de vie
    activatedAt: utc(),
    cancelledAt: utc(),
    deletionScheduledAt: utc(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("tenants_slug_key").on(t.slug),
    index("tenants_status_idx").on(t.status),
    check("tenants_slug_format", sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'`),
  ],
);

/**
 * Entreprise : l'identité légale (SIRET), le compte Stripe, et tout ce qui fait
 * l'activité (membres, prestations, horaires, agenda, clientes, conditions
 * d'annulation). Un site (tenant) en contient une ou plusieurs, ex. un institut
 * partagé par deux indépendantes. Les données d'une entreprise sont isolées de
 * celles des autres entreprises du même site, comme entre deux sites.
 */
export const businesses = pgTable(
  "businesses",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Nom affiché sur le site à côté des prestations (« qui la réalise »). */
    name: text().notNull(),
    legalName: text(),
    siret: text(),
    vatNumber: text(),
    email: text(),
    phone: text(),
    /** Adresse légale si elle diffère de celle du site. */
    addressLine1: text(),
    postalCode: text(),
    city: text(),
    // Stripe Connect (acomptes, encaissés par cette entreprise)
    stripeAccountId: text(),
    stripeChargesEnabled: boolean().notNull().default(false),
    /** Adresse de sa page sur le site : /avec/<slug>. */
    slug: text(),
    profile: jsonb().$type<BusinessProfile>().notNull().default({}),
    /** Fiche Google de l'entreprise (identifiant « place ») : ses avis s'affichent sur le site. */
    googlePlaceId: text(),
    /** Entreprise principale : celle qui règle l'abonnement du site. */
    isPrimary: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique("businesses_tenant_id_key").on(t.tenantId, t.id),
    uniqueIndex("businesses_stripe_account_id_key").on(t.stripeAccountId),
    uniqueIndex("businesses_one_primary_key")
      .on(t.tenantId)
      .where(sql`${t.isPrimary}`),
    index("businesses_tenant_idx").on(t.tenantId),
    uniqueIndex("businesses_tenant_slug_key").on(t.tenantId, t.slug),
  ],
);

/** Rattache une ligne à une entreprise du même site (clé composée : impossible de viser l'entreprise d'un autre site). */
export function businessForeignKey(
  name: string,
  columns: { tenantId: AnyPgColumn; businessId: AnyPgColumn },
  onDelete: "cascade" | "restrict" = "cascade",
) {
  return foreignKey({
    name,
    columns: [columns.tenantId, columns.businessId],
    foreignColumns: [businesses.tenantId, businesses.id],
  }).onDelete(onDelete);
}

export const domainTypeEnum = pgEnum("domain_type", ["subdomain", "custom"]);
export const domainStatusEnum = pgEnum("domain_status", ["pending", "active", "error"]);

/** Adresses du site d'un tenant (sous-domaine gratuit ou domaine propre). */
export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    hostname: text().notNull(),
    type: domainTypeEnum().notNull(),
    isPrimary: boolean().notNull().default(false),
    status: domainStatusEnum().notNull().default("pending"),
    cloudflareHostnameId: text(),
    sslStatus: text(),
    verifiedAt: utc(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("tenant_domains_hostname_key").on(t.hostname),
    index("tenant_domains_tenant_idx").on(t.tenantId),
    uniqueIndex("tenant_domains_one_primary_key")
      .on(t.tenantId)
      .where(sql`${t.isPrimary}`),
    check("tenant_domains_hostname_lowercase", sql`${t.hostname} = lower(${t.hostname})`),
  ],
);

export const depositTypeEnum = pgEnum("deposit_type", ["percent", "fixed"]);

/** Règles de réservation, conditions d'annulation et préférences : une ligne par entreprise. */
export const businessSettings = pgTable(
  "business_settings",
  {
    businessId: uuid().primaryKey(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    minNoticeMinutes: integer().notNull().default(120),
    maxAdvanceDays: integer().notNull().default(60),
    slotIntervalMinutes: smallint().notNull().default(15),
    maxServicesPerBooking: smallint().notNull().default(3),
    cancellationDeadlineHours: integer().notNull().default(24),
    /** Réservation en ligne ouverte. Coupée : le site reste une vitrine (appeler, écrire). */
    onlineBookingEnabled: boolean().notNull().default(true),
    depositEnabled: boolean().notNull().default(false),
    depositType: depositTypeEnum().notNull().default("percent"),
    /** Pourcentage (30 = 30 %) ou montant fixe en centimes, selon depositType. */
    depositValue: integer().notNull().default(30),
    holdMinutes: smallint().notNull().default(10),
    dailySummaryEnabled: boolean().notNull().default(true),
    monthlySummaryEnabled: boolean().notNull().default(true),
    /** Demande d'avis Google envoyée à la cliente après un rendez-vous marqué « venue ». */
    reviewRequestEnabled: boolean().notNull().default(false),
    /** Lien d'abonnement à l'agenda (téléphone) : 0 = désactivé ; augmenté à chaque nouveau lien. */
    calendarFeedVersion: integer().notNull().default(0),
    // Objectifs du mois fixés par la gérante (statistiques) ; vides = pas d'objectif.
    revenueGoalCents: integer(),
    appointmentsGoal: integer(),
    newCustomersGoal: integer(),
    // Cartes cadeaux (pack qui les inclut) : réglages de l'entreprise.
    giftCardsEnabled: boolean().notNull().default(false),
    giftCardValidityMonths: smallint().notNull().default(12),
    /** Montants proposés, en centimes. */
    giftCardAmounts: integer()
      .array()
      .notNull()
      .default(sql`'{3000,5000,10000}'`),
    giftCardMinCents: integer().notNull().default(1000),
    giftCardMaxCents: integer().notNull().default(50000),
    // Fidélité (pack qui l'inclut) : un point par rendez-vous honoré.
    loyaltyEnabled: boolean().notNull().default(false),
    loyaltyVisitsRequired: smallint().notNull().default(10),
    /** Avantage offert, en texte libre (ex. « Un soin du visage offert »). */
    loyaltyRewardLabel: text(),
    /** Ou un montant offert, en centimes. */
    loyaltyRewardCents: integer(),
    loyaltyRewardValidityDays: smallint().notNull().default(90),
    // Anniversaire des clientes (pack avec les codes promo) : e-mail et code personnel le jour J.
    birthdayOfferEnabled: boolean().notNull().default(false),
    /** Réduction du code personnel, en pourcentage (valeur de départ : config/defaults.ts). */
    birthdayDiscountPercent: smallint().notNull().default(DEFAULT_BIRTHDAY_OFFER.discountPercent),
    /** Validité du code personnel, en jours. */
    birthdayOfferDays: smallint().notNull().default(DEFAULT_BIRTHDAY_OFFER.validityDays),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("business_settings_business_fk", t),
    index("business_settings_tenant_idx").on(t.tenantId),
    check("tenant_settings_min_notice", sql`${t.minNoticeMinutes} >= 0`),
    check("tenant_settings_max_advance", sql`${t.maxAdvanceDays} between 1 and 730`),
    check("tenant_settings_slot_interval", sql`${t.slotIntervalMinutes} between 5 and 120`),
    check("tenant_settings_max_services", sql`${t.maxServicesPerBooking} between 1 and 10`),
    check("tenant_settings_deposit_value", sql`${t.depositValue} >= 0`),
    check("tenant_settings_deposit_percent", sql`${t.depositType} <> 'percent' or ${t.depositValue} <= 100`),
    check("tenant_settings_hold", sql`${t.holdMinutes} between 1 and 60`),
    check("business_settings_gift_validity", sql`${t.giftCardValidityMonths} between 1 and 60`),
    check("business_settings_loyalty_visits", sql`${t.loyaltyVisitsRequired} between 2 and 50`),
    check("business_settings_loyalty_validity", sql`${t.loyaltyRewardValidityDays} between 7 and 730`),
    check(
      "business_settings_loyalty_reward",
      sql`${t.loyaltyRewardCents} is null or ${t.loyaltyRewardCents} > 0`,
    ),
    check("business_settings_birthday_percent", sql`${t.birthdayDiscountPercent} between 1 and 100`),
    check("business_settings_birthday_days", sql`${t.birthdayOfferDays} between 1 and 90`),
    check(
      "business_settings_gift_range",
      sql`${t.giftCardMinCents} > 0 and ${t.giftCardMinCents} <= ${t.giftCardMaxCents}`,
    ),
  ],
);

/** Redirections des anciennes adresses du site du client. */
export const redirects = pgTable(
  "redirects",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    fromPath: text().notNull(),
    toPath: text().notNull(),
    statusCode: smallint().notNull().default(301),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("redirects_tenant_from_key").on(t.tenantId, t.fromPath),
    check("redirects_status_code", sql`${t.statusCode} in (301, 302, 307, 308)`),
  ],
);
