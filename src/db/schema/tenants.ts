import { sql } from "drizzle-orm";
import {
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
} from "drizzle-orm/pg-core";
import { currency, id, timestamps, utc } from "./_helpers";
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

export const siteThemeEnum = pgEnum("site_theme", ["light", "dark", "nature"]);

export type TenantBrand = {
  logoAssetId?: string | null;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
};

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    legalName: text(),
    siret: text(),
    vatNumber: text(),
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

    // Stripe Connect (acomptes)
    stripeAccountId: text(),
    stripeChargesEnabled: boolean().notNull().default(false),

    // Cycle de vie
    activatedAt: utc(),
    cancelledAt: utc(),
    deletionScheduledAt: utc(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("tenants_slug_key").on(t.slug),
    uniqueIndex("tenants_stripe_account_id_key").on(t.stripeAccountId),
    index("tenants_status_idx").on(t.status),
    check("tenants_slug_format", sql`${t.slug} ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'`),
  ],
);

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

/** Règles de réservation et préférences de la gérante (une ligne par tenant). */
export const tenantSettings = pgTable(
  "tenant_settings",
  {
    tenantId: uuid()
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    minNoticeMinutes: integer().notNull().default(120),
    maxAdvanceDays: integer().notNull().default(60),
    slotIntervalMinutes: smallint().notNull().default(15),
    maxServicesPerBooking: smallint().notNull().default(3),
    cancellationDeadlineHours: integer().notNull().default(24),
    depositEnabled: boolean().notNull().default(false),
    depositType: depositTypeEnum().notNull().default("percent"),
    /** Pourcentage (30 = 30 %) ou montant fixe en centimes, selon depositType. */
    depositValue: integer().notNull().default(30),
    holdMinutes: smallint().notNull().default(10),
    dailySummaryEnabled: boolean().notNull().default(true),
    monthlySummaryEnabled: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check("tenant_settings_min_notice", sql`${t.minNoticeMinutes} >= 0`),
    check("tenant_settings_max_advance", sql`${t.maxAdvanceDays} between 1 and 730`),
    check("tenant_settings_slot_interval", sql`${t.slotIntervalMinutes} between 5 and 120`),
    check("tenant_settings_max_services", sql`${t.maxServicesPerBooking} between 1 and 10`),
    check("tenant_settings_deposit_value", sql`${t.depositValue} >= 0`),
    check("tenant_settings_deposit_percent", sql`${t.depositType} <> 'percent' or ${t.depositValue} <= 100`),
    check("tenant_settings_hold", sql`${t.holdMinutes} between 1 and 60`),
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
