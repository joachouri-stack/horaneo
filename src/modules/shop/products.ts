import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { assets, products, tenants } from "@/db/schema";
import { priceInput } from "@/modules/catalog/services";
import { setLocalized } from "@/modules/content/localized";
import { AppError } from "@/modules/errors";
import { retireAsset } from "@/modules/media/assets";
import { assertFeature } from "@/modules/quotas";

/**
 * Boutique (solution Commerce) : catalogue de produits d'une entreprise.
 * Réservé aux packs qui comprennent la boutique (fonction « commerce »).
 * Fonctions (tx, tenantId, input) : utilisables par la gérante (withTenant) et l'admin (withPlatform).
 */

export const productInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  price: priceInput,
  /** Stock : vide = non suivi (toujours disponible), sinon un nombre entier. */
  stock: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int().min(0).max(1_000_000).nullable()),
  isActive: z.boolean().default(true),
});

export type ProductRow = typeof products.$inferSelect;

async function tenantInfo(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ locale: tenants.defaultLocale, currency: tenants.currency })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  return row;
}

async function findProduct(tx: Transaction, tenantId: string, productId: string) {
  const [row] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
  if (!row) throw new AppError("not_found");
  return row;
}

/** Produits de l'entreprise déclarée (tous, actifs ou non), dans l'ordre choisi, avec leur photo. */
export async function listProducts(tx: Transaction, tenantId: string) {
  const rows = await tx
    .select({ product: products, photoKey: assets.storageKey })
    .from(products)
    .leftJoin(assets, and(eq(assets.tenantId, products.tenantId), eq(assets.id, products.photoAssetId)))
    .where(eq(products.tenantId, tenantId))
    .orderBy(asc(products.sortOrder), asc(products.createdAt));
  return rows.map((row) => ({ ...row.product, photoKey: row.photoKey }));
}

export async function saveProduct(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof productInput>,
  productId?: string,
) {
  await assertFeature(tx, tenantId, "commerce");
  const input = productInput.parse(raw);
  const { locale, currency } = await tenantInfo(tx, tenantId);
  const values = {
    priceCents: input.price,
    currency,
    stockQuantity: input.stock,
    isActive: input.isActive,
  };
  if (productId) {
    const existing = await findProduct(tx, tenantId, productId);
    const [updated] = await tx
      .update(products)
      .set({
        ...values,
        name: setLocalized(existing.name, locale, input.name),
        description: setLocalized(existing.description, locale, input.description),
      })
      .where(eq(products.id, existing.id))
      .returning();
    return updated;
  }
  const [{ value: position }] = await tx
    .select({ value: count() })
    .from(products)
    .where(eq(products.tenantId, tenantId));
  const [created] = await tx
    .insert(products)
    .values({
      tenantId,
      ...values,
      name: setLocalized({}, locale, input.name),
      description: setLocalized({}, locale, input.description),
      sortOrder: position,
    })
    .returning();
  return created;
}

/** Supprime un produit ; sa photo est mise de côté (récupérable quelques jours). */
export async function deleteProduct(tx: Transaction, tenantId: string, productId: string) {
  await assertFeature(tx, tenantId, "commerce");
  const existing = await findProduct(tx, tenantId, productId);
  await tx.delete(products).where(eq(products.id, existing.id));
  if (existing.photoAssetId) await retireAsset(tx, tenantId, existing.photoAssetId);
  return { deleted: true };
}

/** Photo d'un produit (une photo « produit » de l'entreprise), ou null pour la retirer. */
export async function setProductPhoto(
  tx: Transaction,
  tenantId: string,
  productId: string,
  assetId: string | null,
) {
  await assertFeature(tx, tenantId, "commerce");
  const existing = await findProduct(tx, tenantId, productId);
  if (assetId) {
    const [asset] = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId), eq(assets.kind, "product")));
    if (!asset) throw new AppError("not_found");
  }
  const [updated] = await tx
    .update(products)
    .set({ photoAssetId: assetId })
    .where(eq(products.id, existing.id))
    .returning();
  // Ancienne photo mise de côté.
  if (existing.photoAssetId && existing.photoAssetId !== assetId)
    await retireAsset(tx, tenantId, existing.photoAssetId, assetId);
  return updated;
}

/** Change la place d'un produit dans la liste (« monter » ou « descendre »). */
export async function moveProduct(
  tx: Transaction,
  tenantId: string,
  productId: string,
  direction: "up" | "down",
) {
  await assertFeature(tx, tenantId, "commerce");
  const list = await listProducts(tx, tenantId);
  const index = list.findIndex((item) => item.id === productId);
  if (index < 0) throw new AppError("not_found");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return;
  const order = [...list];
  [order[index], order[target]] = [order[target], order[index]];
  for (const [position, item] of order.entries()) {
    if (item.sortOrder !== position)
      await tx.update(products).set({ sortOrder: position }).where(eq(products.id, item.id));
  }
}
