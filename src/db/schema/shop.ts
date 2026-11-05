import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, currency, id, localized, timestamps, utc } from "./_helpers";
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
    /** Catégorie libre (« Soins visage », « Bougies »…) : les produits sont regroupés par catégorie. */
    category: text(),
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

/**
 * Variantes d'un produit (taille, couleur, contenance…) : chacune a son nom, son prix
 * (vide : celui du produit) et son stock (vide : non suivi). Un produit qui a des variantes
 * se commande toujours avec l'une d'elles.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    productId: uuid().notNull(),
    name: localized().notNull(),
    priceCents: cents(),
    stockQuantity: integer(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("product_variants_business_fk", t, "cascade"),
    unique("product_variants_business_id_key").on(t.businessId, t.id),
    foreignKey({
      name: "product_variants_product_fk",
      columns: [t.businessId, t.productId],
      foreignColumns: [products.businessId, products.id],
    }).onDelete("cascade"),
    index("product_variants_product_idx").on(t.productId, t.sortOrder),
    check("product_variants_price", sql`${t.priceCents} IS NULL OR ${t.priceCents} >= 0`),
    check("product_variants_stock", sql`${t.stockQuantity} IS NULL OR ${t.stockQuantity} >= 0`),
  ],
);

/**
 * État d'une commande : en attente du paiement (stock réservé pendant quelques minutes),
 * payée, prête à être retirée, retirée ; ou annulée, expirée (paiement non abouti, stock
 * rendu), remboursée.
 */
export const shopOrderStatusEnum = pgEnum("shop_order_status", [
  "pending_payment",
  "paid",
  "ready",
  "collected",
  "cancelled",
  "expired",
  "refunded",
]);

/** Commandes de la boutique (retrait sur place). Données privées de l'entreprise. */
export const shopOrders = pgTable(
  "shop_orders",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    status: shopOrderStatusEnum().notNull().default("pending_payment"),
    customerName: text().notNull(),
    customerEmail: text().notNull(),
    customerPhone: text(),
    note: text(),
    totalCents: cents().notNull(),
    currency: currency().notNull().default("EUR"),
    locale: text().notNull().default("fr"),
    /** Fin de la réservation du stock si le paiement n'aboutit pas. */
    holdExpiresAt: utc(),
    stripeAccountId: text(),
    stripePaymentIntentId: text(),
    stripeRefundId: text(),
    paidAt: utc(),
    readyAt: utc(),
    collectedAt: utc(),
    cancelledAt: utc(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("shop_orders_business_fk", t, "restrict"),
    unique("shop_orders_business_id_key").on(t.businessId, t.id),
    uniqueIndex("shop_orders_payment_intent_key").on(t.stripePaymentIntentId),
    index("shop_orders_tenant_status_idx").on(t.tenantId, t.businessId, t.status, t.createdAt),
    check("shop_orders_total", sql`${t.totalCents} >= 0`),
  ],
);

/** Articles d'une commande : nom et prix copiés au moment de l'achat (le produit peut changer ensuite). */
export const shopOrderItems = pgTable(
  "shop_order_items",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    orderId: uuid().notNull(),
    /** Produit d'origine (sans lien imposé : un produit supprimé ne supprime pas la commande). */
    productId: uuid(),
    /** Variante choisie (même remarque). */
    variantId: uuid(),
    name: text().notNull(),
    unitPriceCents: cents().notNull(),
    quantity: integer().notNull(),
    /** Le stock du produit était suivi (il est rendu si la commande est annulée). */
    stockTracked: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("shop_order_items_business_fk", t, "restrict"),
    foreignKey({
      name: "shop_order_items_order_fk",
      columns: [t.businessId, t.orderId],
      foreignColumns: [shopOrders.businessId, shopOrders.id],
    }).onDelete("cascade"),
    index("shop_order_items_order_idx").on(t.orderId),
    check("shop_order_items_quantity", sql`${t.quantity} > 0`),
    check("shop_order_items_price", sql`${t.unitPriceCents} >= 0`),
  ],
);
