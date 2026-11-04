import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, unique, uuid } from "drizzle-orm/pg-core";
import { cents, currency, id, localized, timestamps } from "./_helpers";
import { assets } from "./content";
import { businessForeignKey, tenants } from "./tenants";

/**
 * Boutique (solution Commerce) : produits vendus par une entreprise.
 * Vitrine : lisibles par tout le site, modifiables par l'entreprise déclarée.
 */
export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Rempli automatiquement avec l'entreprise en cours (app_current_business()). */
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    name: localized().notNull(),
    description: localized(),
    priceCents: cents().notNull(),
    currency: currency().notNull().default("EUR"),
    /** Quantité en stock ; vide : stock non suivi (toujours disponible). */
    stockQuantity: integer(),
    photoAssetId: uuid(),
    /** Visible et en vente sur le site. */
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("products_business_fk", t, "cascade"),
    unique("products_business_id_key").on(t.businessId, t.id),
    unique("products_tenant_id_key").on(t.tenantId, t.id),
    index("products_tenant_business_idx").on(t.tenantId, t.businessId, t.sortOrder),
    foreignKey({
      name: "products_photo_fk",
      columns: [t.tenantId, t.photoAssetId],
      foreignColumns: [assets.tenantId, assets.id],
    }).onDelete("restrict"),
    check("products_price", sql`${t.priceCents} >= 0`),
    check("products_stock", sql`${t.stockQuantity} IS NULL OR ${t.stockQuantity} >= 0`),
  ],
);
