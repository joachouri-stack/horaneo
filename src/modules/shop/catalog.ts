import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { assets, products } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";

/**
 * Boutique côté site public : produits en vente d'une entreprise et calcul du panier.
 * Les prix et le stock sont toujours relus en base (jamais ceux envoyés par le navigateur).
 */

export type ShopProduct = {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  /** null : stock non suivi (toujours disponible). */
  stockQuantity: number | null;
  photo: { key: string; width: number | null; height: number | null } | null;
};

/** Nombre maximal d'exemplaires d'un même produit dans un panier. */
export const MAX_QUANTITY = 20;

function toShopProduct(
  row: typeof products.$inferSelect,
  photo: { storageKey: string; width: number | null; height: number | null } | null,
  locale: Locale,
): ShopProduct {
  return {
    id: row.id,
    businessId: row.businessId,
    name: pickLocalized(row.name, locale),
    description: row.description ? pickLocalized(row.description, locale) || null : null,
    priceCents: row.priceCents,
    currency: row.currency,
    stockQuantity: row.stockQuantity,
    photo: photo ? { key: photo.storageKey, width: photo.width, height: photo.height } : null,
  };
}

async function selectProducts(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  locale: Locale,
  ids?: string[],
) {
  const rows = await tx
    .select({
      product: products,
      storageKey: assets.storageKey,
      width: assets.width,
      height: assets.height,
    })
    .from(products)
    .leftJoin(assets, and(eq(assets.tenantId, products.tenantId), eq(assets.id, products.photoAssetId)))
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.businessId, businessId),
        eq(products.isActive, true),
        ids ? inArray(products.id, ids) : undefined,
      ),
    )
    .orderBy(asc(products.sortOrder), asc(products.createdAt));
  return rows.map((row) =>
    toShopProduct(
      row.product,
      row.storageKey ? { storageKey: row.storageKey, width: row.width, height: row.height } : null,
      locale,
    ),
  );
}

/** Produits en vente d'une entreprise du site. */
export async function shopProducts(tx: Transaction, tenantId: string, businessId: string, locale: Locale) {
  return selectProducts(tx, tenantId, businessId, locale);
}

/** Un produit en vente (404 s'il n'existe pas ou n'est plus en vente). */
export async function shopProduct(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  productId: string,
  locale: Locale,
) {
  const [product] = await selectProducts(tx, tenantId, businessId, locale, [productId]);
  if (!product) throw new AppError("not_found");
  return product;
}

export const cartInput = z
  .array(
    z.object({
      productId: z.uuid(),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  )
  .min(1)
  .max(50);

export type CartLine = {
  product: ShopProduct;
  quantity: number;
  /** Quantité encore disponible (null : stock non suivi). */
  available: number | null;
  /** Assez de stock pour la quantité demandée. */
  ok: boolean;
  totalCents: number;
};

/**
 * Panier relu en base : produits encore en vente de l'entreprise, prix actuels, stock.
 * Les produits retirés de la vente disparaissent du panier (`removed`).
 */
export async function priceCart(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  raw: z.input<typeof cartInput>,
  locale: Locale,
) {
  const items = cartInput.parse(raw);
  // Même produit en double : quantités additionnées.
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  const found = await selectProducts(tx, tenantId, businessId, locale, [...merged.keys()]);
  const lines: CartLine[] = found.map((product) => {
    const quantity = Math.min(merged.get(product.id) ?? 1, MAX_QUANTITY);
    const available = product.stockQuantity;
    return {
      product,
      quantity,
      available,
      ok: available === null || quantity <= available,
      totalCents: product.priceCents * quantity,
    };
  });
  const removed = [...merged.keys()].filter((id) => !found.some((product) => product.id === id));
  return {
    lines,
    removed,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    currency: found[0]?.currency ?? null,
    ready: lines.length > 0 && lines.every((line) => line.ok),
  };
}
