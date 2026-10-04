import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, id, localized, timestamps, utc } from "./_helpers";
import { discountTypeEnum } from "./bookings";
import { services } from "./content";
import { businessForeignKey, tenants } from "./tenants";

/**
 * Étape 9 bis : historique des prix (prix barré honnête), promotions datées,
 * avis Google mis en cache. Les cartes cadeaux sont avec les paiements (billing.ts).
 */

const tenantRef = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

/** Rempli automatiquement avec l'entreprise en cours (app_current_business()). */
const businessRef = () =>
  uuid()
    .notNull()
    .default(sql`app_current_business()`);

/**
 * Prix successifs d'une prestation : une ligne à chaque changement. Sert à
 * afficher comme « ancien prix » d'une promotion le prix le plus bas pratiqué
 * dans les 30 jours qui la précèdent.
 */
export const servicePriceHistory = pgTable(
  "service_price_history",
  {
    id: id(),
    tenantId: tenantRef(),
    businessId: businessRef(),
    serviceId: uuid().notNull(),
    priceCents: cents().notNull(),
    startsAt: utc().notNull().defaultNow(),
  },
  (t) => [
    businessForeignKey("service_price_history_business_fk", t, "cascade"),
    foreignKey({
      name: "service_price_history_service_fk",
      columns: [t.businessId, t.serviceId],
      foreignColumns: [services.businessId, services.id],
    }).onDelete("cascade"),
    index("service_price_history_service_idx").on(t.serviceId, t.startsAt),
    check("service_price_history_price", sql`${t.priceCents} >= 0`),
  ],
);

/** Promotions datées : bandeau « offre du moment » et prix barré pendant la période. */
export const promotions = pgTable(
  "promotions",
  {
    id: id(),
    tenantId: tenantRef(),
    businessId: businessRef(),
    title: localized().notNull(),
    /** Pourcentage (20 = 20 %) ou montant retiré en centimes. */
    discountType: discountTypeEnum().notNull(),
    discountValue: integer().notNull(),
    /** Dates incluses, dans le fuseau de l'établissement. */
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("promotions_business_fk", t, "cascade"),
    unique("promotions_business_id_key").on(t.businessId, t.id),
    index("promotions_tenant_dates_idx").on(t.tenantId, t.endsOn),
    check("promotions_value", sql`${t.discountValue} > 0`),
    check("promotions_percent", sql`${t.discountType} <> 'percent' or ${t.discountValue} < 100`),
    check("promotions_dates", sql`${t.startsOn} <= ${t.endsOn}`),
  ],
);

/** Prestations concernées par une promotion (de la même entreprise). */
export const promotionServices = pgTable(
  "promotion_services",
  {
    tenantId: tenantRef(),
    businessId: businessRef(),
    promotionId: uuid().notNull(),
    serviceId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.promotionId, t.serviceId] }),
    businessForeignKey("promotion_services_business_fk", t, "cascade"),
    foreignKey({
      name: "promotion_services_promotion_fk",
      columns: [t.businessId, t.promotionId],
      foreignColumns: [promotions.businessId, promotions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "promotion_services_service_fk",
      columns: [t.businessId, t.serviceId],
      foreignColumns: [services.businessId, services.id],
    }).onDelete("cascade"),
    index("promotion_services_service_idx").on(t.serviceId),
  ],
);

export type CachedReview = {
  author: string;
  authorUrl: string | null;
  authorPhotoUrl: string | null;
  rating: number;
  text: string;
  relativeTime: string;
  publishedAt: string | null;
};

/**
 * Avis Google d'une entreprise, relus une fois par jour (rôle plateforme).
 * Le site affiche cette copie ; si Google ne répond pas, la dernière reste
 * affichée (30 jours au plus), avec le lien vers tous les avis.
 */
export const googleReviews = pgTable(
  "google_reviews",
  {
    businessId: uuid().primaryKey(),
    tenantId: tenantRef(),
    placeId: text().notNull(),
    rating: numeric({ precision: 2, scale: 1, mode: "number" }),
    total: integer().notNull().default(0),
    reviews: jsonb().$type<CachedReview[]>().notNull().default([]),
    /** Lien vers la fiche (tous les avis). */
    url: text(),
    fetchedAt: utc(),
    lastError: text(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("google_reviews_business_fk", t, "cascade"),
    index("google_reviews_tenant_idx").on(t.tenantId),
  ],
);
