import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { SHOP } from "@/config/shop";
import type { Transaction } from "@/db/client";
import { assets, products, productVariants } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";

/**
 * Boutique côté site public : produits en vente d'une entreprise et calcul du panier.
 * Les prix et le stock sont toujours relus en base (jamais ceux envoyés par le navigateur).
 */

export type ShopVariant = {
  id: string;
  name: string;
  priceCents: number;
  /** null : stock non suivi (toujours disponible). */
  stockQuantity: number | null;
};

export type ShopProduct = {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number;
  /** Prix avant promotion (prix barré) ; null : pas de promotion. */
  compareAtPriceCents: number | null;
  /** Ajouté récemment : étiquette « Nouveau ». */
  isNew: boolean;
  currency: string;
  /** null : stock non suivi (toujours disponible). Sans effet si le produit a des variantes. */
  stockQuantity: number | null;
  photo: { key: string; width: number | null; height: number | null } | null;
  /** Variantes en vente (taille, couleur…) : il faut alors en choisir une. */
  variants: ShopVariant[];
};

/** Nombre maximal d'exemplaires d'un même article dans un panier. */
export const MAX_QUANTITY = 20;

/** Plus petit prix d'un produit (« à partir de ») et présence de prix différents. */
export function priceRange(product: Pick<ShopProduct, "priceCents" | "variants">) {
  const prices = product.variants.length ? product.variants.map((v) => v.priceCents) : [product.priceCents];
  const min = Math.min(...prices);
  return { min, varies: prices.some((price) => price !== min) };
}

/**
 * Promotion affichée : prix barré et pourcentage de réduction (arrondi). Seulement quand le
 * prix de vente est unique (sans variantes à des prix différents).
 */
export function promotion(product: Pick<ShopProduct, "priceCents" | "compareAtPriceCents" | "variants">) {
  const { min, varies } = priceRange(product);
  if (varies || product.compareAtPriceCents === null || product.compareAtPriceCents <= min) return null;
  return {
    compareAtPriceCents: product.compareAtPriceCents,
    percent: Math.round((1 - min / product.compareAtPriceCents) * 100),
  };
}

/** Plus aucun exemplaire disponible (produit, ou toutes ses variantes). */
export function soldOut(product: Pick<ShopProduct, "stockQuantity" | "variants">) {
  return product.variants.length
    ? product.variants.every((variant) => variant.stockQuantity === 0)
    : product.stockQuantity === 0;
}

async function selectProducts(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  locale: Locale,
  ids?: string[],
  now = new Date(),
): Promise<ShopProduct[]> {
  const newSince = now.getTime() - SHOP.newForDays * 86_400_000;
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
  const variantRows = rows.length
    ? await tx
        .select()
        .from(productVariants)
        .where(
          and(
            inArray(
              productVariants.productId,
              rows.map((row) => row.product.id),
            ),
            eq(productVariants.isActive, true),
          ),
        )
        .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt))
    : [];
  return rows.map(({ product, storageKey, width, height }) => ({
    id: product.id,
    businessId: product.businessId,
    name: pickLocalized(product.name, locale),
    description: product.description ? pickLocalized(product.description, locale) || null : null,
    category: product.category,
    priceCents: product.priceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    isNew: product.createdAt.getTime() >= newSince,
    currency: product.currency,
    stockQuantity: product.stockQuantity,
    photo: storageKey ? { key: storageKey, width, height } : null,
    variants: variantRows
      .filter((variant) => variant.productId === product.id)
      .map((variant) => ({
        id: variant.id,
        name: pickLocalized(variant.name, locale),
        priceCents: variant.priceCents ?? product.priceCents,
        stockQuantity: variant.stockQuantity,
      })),
  }));
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
      variantId: z.uuid().nullish(),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  )
  .min(1)
  .max(50);

export type CartLine = {
  product: ShopProduct;
  variant: ShopVariant | null;
  /** Nom affiché : « Sérum éclat — 30 ml ». */
  name: string;
  unitPriceCents: number;
  quantity: number;
  /** Quantité encore disponible (null : stock non suivi). */
  available: number | null;
  /** Assez de stock pour la quantité demandée. */
  ok: boolean;
  totalCents: number;
};

/** Clé d'un article du panier : produit et variante. */
export const lineKey = (productId: string, variantId?: string | null) => `${productId}:${variantId ?? ""}`;

/**
 * Panier relu en base : produits (et variantes) encore en vente de l'entreprise, prix actuels,
 * stock. Les articles qui ne sont plus en vente disparaissent du panier (`removed` : leurs clés).
 */
export async function priceCart(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  raw: z.input<typeof cartInput>,
  locale: Locale,
) {
  const items = cartInput.parse(raw);
  // Même article en double : quantités additionnées.
  const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>();
  for (const item of items) {
    const key = lineKey(item.productId, item.variantId);
    const previous = merged.get(key);
    merged.set(key, {
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: (previous?.quantity ?? 0) + item.quantity,
    });
  }
  const found = await selectProducts(tx, tenantId, businessId, locale, [
    ...new Set([...merged.values()].map((item) => item.productId)),
  ]);
  const lines: CartLine[] = [];
  const removed: string[] = [];
  for (const [key, item] of merged) {
    const product = found.find((candidate) => candidate.id === item.productId);
    // Produit à variantes : il faut une variante encore en vente ; sans variantes : aucune.
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId) ?? null;
    if (!product || (product.variants.length > 0 ? !variant : item.variantId !== null)) {
      removed.push(key);
      continue;
    }
    const quantity = Math.min(item.quantity, MAX_QUANTITY);
    const available = variant ? variant.stockQuantity : product.stockQuantity;
    const unitPriceCents = variant ? variant.priceCents : product.priceCents;
    lines.push({
      product,
      variant,
      name: variant ? `${product.name} — ${variant.name}` : product.name,
      unitPriceCents,
      quantity,
      available,
      ok: available === null || quantity <= available,
      totalCents: unitPriceCents * quantity,
    });
  }
  return {
    lines,
    removed,
    totalCents: lines.reduce((sum, line) => sum + line.totalCents, 0),
    currency: found[0]?.currency ?? null,
    ready: lines.length > 0 && lines.every((line) => line.ok),
  };
}
