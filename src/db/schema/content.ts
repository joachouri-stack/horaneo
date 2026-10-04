import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, currency, id, localized, timestamps, utc } from "./_helpers";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Famille D : contenus du site d'un tenant.
 *
 * Les liens entre tables d'un même tenant utilisent des clés composées
 * (tenant_id, id) : la base refuse qu'une prestation du tenant A pointe vers
 * une catégorie du tenant B, même en cas d'erreur dans le code.
 */

const tenantRef = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const assetKindEnum = pgEnum("asset_kind", ["logo", "cover", "gallery", "staff", "service", "other"]);
export const assetStatusEnum = pgEnum("asset_status", ["active", "replaced"]);

/** Photos et fichiers (stockés sur Cloudflare R2). */
export const assets = pgTable(
  "assets",
  {
    id: id(),
    tenantId: tenantRef(),
    kind: assetKindEnum().notNull(),
    storageKey: text().notNull(),
    mimeType: text().notNull(),
    bytes: integer().notNull(),
    width: integer(),
    height: integer(),
    alt: localized(),
    sortOrder: integer().notNull().default(0),
    status: assetStatusEnum().notNull().default("active"),
    replacedById: uuid(),
    /** Date après laquelle une photo remplacée est définitivement supprimée. */
    purgeAfter: utc(),
    uploadedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    unique("assets_tenant_id_key").on(t.tenantId, t.id),
    uniqueIndex("assets_storage_key_key").on(t.storageKey),
    index("assets_tenant_kind_idx").on(t.tenantId, t.kind, t.status),
    check("assets_bytes_positive", sql`${t.bytes} > 0`),
  ],
);

export const sitePageKeyEnum = pgEnum("site_page_key", [
  "home",
  "about",
  "team",
  "gallery",
  "testimonials",
  "practical",
  "legal",
]);

/** Pages du site : contenu sous forme de blocs JSON aux textes traduisibles. */
export const sitePages = pgTable(
  "site_pages",
  {
    id: id(),
    tenantId: tenantRef(),
    pageKey: sitePageKeyEnum().notNull(),
    content: jsonb().notNull().default({}),
    seoTitle: localized(),
    seoDescription: localized(),
    isPublished: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex("site_pages_tenant_page_key").on(t.tenantId, t.pageKey)],
);

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: id(),
    tenantId: tenantRef(),
    name: localized().notNull(),
    /** Adresse de la page de la catégorie, par langue : { "fr": "soins-visage" }. */
    slug: localized().notNull(),
    description: localized(),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [unique("service_categories_tenant_id_key").on(t.tenantId, t.id)],
);

/** Prestations. */
export const services = pgTable(
  "services",
  {
    id: id(),
    tenantId: tenantRef(),
    categoryId: uuid(),
    name: localized().notNull(),
    description: localized(),
    durationMinutes: smallint().notNull(),
    /** Temps de battement après la prestation, invisible pour la cliente. */
    bufferMinutes: smallint().notNull().default(0),
    priceCents: cents().notNull(),
    currency: currency().notNull().default("EUR"),
    /** Affiche « à partir de » devant le prix. */
    priceFrom: boolean().notNull().default(false),
    isOnlineBookable: boolean().notNull().default(true),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique("services_tenant_id_key").on(t.tenantId, t.id),
    index("services_tenant_category_idx").on(t.tenantId, t.categoryId),
    foreignKey({
      name: "services_category_fk",
      columns: [t.tenantId, t.categoryId],
      foreignColumns: [serviceCategories.tenantId, serviceCategories.id],
    }).onDelete("restrict"),
    check("services_duration", sql`${t.durationMinutes} between 5 and 1440`),
    check("services_buffer", sql`${t.bufferMinutes} between 0 and 240`),
    check("services_price", sql`${t.priceCents} >= 0`),
  ],
);

/** Membres de l'équipe. */
export const staffMembers = pgTable(
  "staff_members",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text().notNull(),
    bio: localized(),
    photoAssetId: uuid(),
    /** Renseigné si le membre se connecte un jour à l'espace gérante. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    color: text(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    unique("staff_members_tenant_id_key").on(t.tenantId, t.id),
    foreignKey({
      name: "staff_members_photo_fk",
      columns: [t.tenantId, t.photoAssetId],
      foreignColumns: [assets.tenantId, assets.id],
    }).onDelete("restrict"),
  ],
);

/** Quel membre sait réaliser quelle prestation. */
export const staffServices = pgTable(
  "staff_services",
  {
    tenantId: tenantRef(),
    staffId: uuid().notNull(),
    serviceId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.staffId, t.serviceId] }),
    index("staff_services_service_idx").on(t.tenantId, t.serviceId),
    foreignKey({
      name: "staff_services_staff_fk",
      columns: [t.tenantId, t.staffId],
      foreignColumns: [staffMembers.tenantId, staffMembers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "staff_services_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("cascade"),
  ],
);

/** Témoignages saisis à la main. */
export const testimonials = pgTable(
  "testimonials",
  {
    id: id(),
    tenantId: tenantRef(),
    authorName: text().notNull(),
    text: localized().notNull(),
    rating: smallint(),
    date: utc(),
    isPublished: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    index("testimonials_tenant_idx").on(t.tenantId),
    check("testimonials_rating", sql`${t.rating} is null or ${t.rating} between 1 and 5`),
  ],
);
