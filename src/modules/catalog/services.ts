import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { assets, serviceCategories, services, staffServices, tenants } from "@/db/schema";
import { setLocalized } from "@/modules/content/localized";
import { slugify } from "@/modules/tenants/slug";
import { CATEGORY_ICONS } from "./icons";
import { AppError } from "@/modules/errors";
import { assertQuota } from "@/modules/quotas";

/** Catégories et prestations d'un établissement. */

async function tenantInfo(tx: Transaction, tenantId: string) {
  const [tenant] = await tx
    .select({ locale: tenants.defaultLocale, currency: tenants.currency })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  return tenant;
}

// ─── Catégories ───────────────────────────────────────────────────────────────

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).optional(),
  /** Absent : inchangé. */
  details: z.string().trim().max(3000).optional(),
  /** Absent : inchangé. */
  icon: z.enum(CATEGORY_ICONS).nullable().optional(),
  isFeatured: z.boolean().optional(),
  inMenu: z.boolean().optional(),
  /** Page « formation » dédiée. Absent : inchangé. */
  isTraining: z.boolean().optional(),
  /** Logos de sa page (photos du site). Absent : inchangé. */
  logoAssetIds: z.array(z.uuid()).max(6).optional(),
});

/** Les logos doivent être des photos de ce site. */
async function assertOwnAssets(tx: Transaction, tenantId: string, ids: string[]) {
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.tenantId, tenantId), inArray(assets.id, ids)));
  if (found.length !== new Set(ids).size) throw new AppError("invalid", "logoAssetIds");
}

export async function listCategories(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, tenantId))
    .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.createdAt));
}

export async function saveCategory(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof categoryInput>,
  categoryId?: string,
) {
  const input = categoryInput.parse(raw);
  const { locale } = await tenantInfo(tx, tenantId);
  if (input.logoAssetIds) await assertOwnAssets(tx, tenantId, input.logoAssetIds);
  if (categoryId) {
    const [existing] = await tx
      .select()
      .from(serviceCategories)
      .where(and(eq(serviceCategories.id, categoryId), eq(serviceCategories.tenantId, tenantId)));
    if (!existing) throw new AppError("not_found");
    const [updated] = await tx
      .update(serviceCategories)
      .set({
        name: setLocalized(existing.name, locale, input.name),
        slug: setLocalized(existing.slug, locale, slugify(input.name)),
        description: setLocalized(existing.description, locale, input.description),
        ...(input.details !== undefined
          ? { details: setLocalized(existing.details, locale, input.details) }
          : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
        ...(input.inMenu !== undefined ? { inMenu: input.inMenu } : {}),
        ...(input.isTraining !== undefined ? { isTraining: input.isTraining } : {}),
        ...(input.logoAssetIds !== undefined ? { logoAssetIds: [...new Set(input.logoAssetIds)] } : {}),
      })
      .where(eq(serviceCategories.id, existing.id))
      .returning();
    return updated;
  }
  const [{ value: position }] = await tx
    .select({ value: count() })
    .from(serviceCategories)
    .where(eq(serviceCategories.tenantId, tenantId));
  const [created] = await tx
    .insert(serviceCategories)
    .values({
      tenantId,
      name: setLocalized({}, locale, input.name),
      slug: setLocalized({}, locale, slugify(input.name)),
      description: setLocalized({}, locale, input.description),
      details: setLocalized({}, locale, input.details),
      icon: input.icon ?? null,
      isFeatured: input.isFeatured ?? false,
      inMenu: input.inMenu ?? false,
      isTraining: input.isTraining ?? false,
      logoAssetIds: [...new Set(input.logoAssetIds ?? [])],
      sortOrder: position,
    })
    .returning();
  return created;
}

/** Ajoute un logo (photo du site) à la page formation d'une catégorie, sans retirer les autres. */
export async function addCategoryLogo(tx: Transaction, tenantId: string, categoryId: string, assetId: string) {
  await assertOwnAssets(tx, tenantId, [assetId]);
  const [existing] = await tx
    .select()
    .from(serviceCategories)
    .where(and(eq(serviceCategories.id, categoryId), eq(serviceCategories.tenantId, tenantId)));
  if (!existing) throw new AppError("not_found");
  const logoAssetIds = [...new Set([...existing.logoAssetIds, assetId])];
  if (logoAssetIds.length > 6) throw new AppError("invalid", "logoAssetIds");
  const [updated] = await tx
    .update(serviceCategories)
    .set({ logoAssetIds })
    .where(eq(serviceCategories.id, existing.id))
    .returning();
  return updated;
}

export async function deleteCategory(tx: Transaction, tenantId: string, categoryId: string) {
  const [{ value }] = await tx
    .select({ value: count() })
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.categoryId, categoryId)));
  if (value > 0) throw new AppError("category_not_empty");
  const [deleted] = await tx
    .delete(serviceCategories)
    .where(and(eq(serviceCategories.id, categoryId), eq(serviceCategories.tenantId, tenantId)))
    .returning();
  if (!deleted) throw new AppError("not_found");
  return deleted;
}

// ─── Prestations ──────────────────────────────────────────────────────────────

/** Prix saisi en euros (« 45 », « 45,50 ») → centimes. */
export const priceInput = z
  .string()
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,2})?$/)
  .transform((value) => Math.round(Number(value.replace(",", ".")) * 100));

export const serviceInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  categoryId: z.uuid().nullable().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(1440),
  bufferMinutes: z.coerce.number().int().min(0).max(240).default(0),
  price: priceInput,
  priceFrom: z.boolean().default(false),
  isOnlineBookable: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export async function listServices(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(services)
    .where(eq(services.tenantId, tenantId))
    .orderBy(asc(services.sortOrder), asc(services.createdAt));
}

export async function saveService(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof serviceInput>,
  serviceId?: string,
) {
  const input = serviceInput.parse(raw);
  const { locale, currency } = await tenantInfo(tx, tenantId);
  const values = {
    categoryId: input.categoryId ?? null,
    durationMinutes: input.durationMinutes,
    bufferMinutes: input.bufferMinutes,
    priceCents: input.price,
    currency,
    priceFrom: input.priceFrom,
    isOnlineBookable: input.isOnlineBookable,
    isActive: input.isActive,
  };
  if (serviceId) {
    const [existing] = await tx
      .select()
      .from(services)
      .where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId)));
    if (!existing) throw new AppError("not_found");
    // Seules les prestations actives comptent dans le pack : une réactivation est contrôlée.
    if (!existing.isActive && input.isActive) await assertQuota(tx, tenantId, "services");
    const [updated] = await tx
      .update(services)
      .set({
        ...values,
        name: setLocalized(existing.name, locale, input.name),
        description: setLocalized(existing.description, locale, input.description),
      })
      .where(eq(services.id, existing.id))
      .returning();
    return updated;
  }
  if (input.isActive) await assertQuota(tx, tenantId, "services");
  const [{ value: position }] = await tx
    .select({ value: count() })
    .from(services)
    .where(eq(services.tenantId, tenantId));
  const [created] = await tx
    .insert(services)
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

/**
 * Supprime une prestation. Si elle figure déjà dans des rendez-vous, elle est
 * seulement désactivée pour garder l'historique.
 */
export async function deleteService(tx: Transaction, tenantId: string, serviceId: string) {
  const [existing] = await tx
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId)));
  if (!existing) throw new AppError("not_found");
  await tx
    .delete(staffServices)
    .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.serviceId, serviceId)));
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.delete(services).where(eq(services.id, serviceId));
    });
    return { deleted: true };
  } catch {
    await tx.update(services).set({ isActive: false }).where(eq(services.id, serviceId));
    return { deleted: false };
  }
}
