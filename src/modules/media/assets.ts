import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, ne } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { assets, tenants } from "@/db/schema";
import { ImageError, processImage, type ImageKind } from "@/lib/images/process";
import { extractPalette, type LogoPalette } from "@/lib/images/palette";
import type { FileStorage } from "@/lib/storage/types";
import { AppError } from "@/modules/errors";
import { assertQuota } from "@/modules/quotas";
import { getPlatformSetting } from "@/modules/settings";

/**
 * Photos et logo d'un établissement.
 * - Le fichier est contrôlé, nettoyé et converti avant d'être stocké.
 * - Le nombre de photos est limité par le pack (le logo ne compte pas).
 * - Une photo retirée est conservée quelques jours et peut être restaurée.
 */

export type UploadInput = {
  bytes: Uint8Array;
  kind: ImageKind;
  uploadedByUserId: string | null;
  alt?: string;
};

function toAppError(error: unknown): never {
  if (error instanceof ImageError) throw new AppError(`image_${error.code}`, "file");
  throw error;
}

export async function uploadAsset(tx: Transaction, store: FileStorage, tenantId: string, input: UploadInput) {
  if (input.kind !== "logo") await assertQuota(tx, tenantId, "photos");
  const image = await processImage(input.bytes, input.kind).catch(toAppError);
  const storageKey = `tenants/${tenantId}/${input.kind}/${randomUUID()}.webp`;
  await store.put(storageKey, image.body, image.contentType);

  const [locale] = await tx
    .select({ value: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const [asset] = await tx
    .insert(assets)
    .values({
      tenantId,
      kind: input.kind,
      storageKey,
      mimeType: image.contentType,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      alt: input.alt && locale ? { [locale.value]: input.alt } : null,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning();
  return asset;
}

/**
 * Nouveau logo : l'ancien est mis de côté, et les couleurs du nouveau sont
 * proposées (à valider dans l'écran « Apparence »).
 */
export async function uploadLogo(
  tx: Transaction,
  store: FileStorage,
  tenantId: string,
  bytes: Uint8Array,
  uploadedByUserId: string | null,
): Promise<{ assetId: string; palette: LogoPalette }> {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const asset = await uploadAsset(tx, store, tenantId, { bytes, kind: "logo", uploadedByUserId });
  const palette = await extractPalette(bytes).catch(toAppError);
  if (tenant.brand.logoAssetId) await retireAsset(tx, tenantId, tenant.brand.logoAssetId, asset.id);
  await tx
    .update(tenants)
    .set({ brand: { ...tenant.brand, logoAssetId: asset.id } })
    .where(eq(tenants.id, tenantId));
  return { assetId: asset.id, palette };
}

/** Met une photo de côté (récupérable pendant le délai de conservation). */
export async function retireAsset(
  tx: Transaction,
  tenantId: string,
  assetId: string,
  replacedById: string | null = null,
) {
  const days = await getPlatformSetting(tx, "replaced_asset_retention_days");
  const [updated] = await tx
    .update(assets)
    .set({ status: "replaced", replacedById, purgeAfter: new Date(Date.now() + days * 24 * 60 * 60 * 1000) })
    .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId), eq(assets.status, "active")))
    .returning();
  if (!updated) throw new AppError("not_found");
  return updated;
}

/**
 * Photo du site modifiable par la gérante : jamais le logo du site, qui se
 * change à part (`uploadLogo`).
 */
export async function assertSitePhoto(tx: Transaction, tenantId: string, assetId: string) {
  const [asset] = await tx
    .select({ kind: assets.kind })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId)));
  if (!asset || asset.kind === "logo") throw new AppError("not_found");
}

/** Remet en place une photo mise de côté, dans la limite du pack. */
export async function restoreAsset(tx: Transaction, tenantId: string, assetId: string) {
  const [asset] = await tx
    .select()
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId), eq(assets.status, "replaced")));
  if (!asset) throw new AppError("not_found");
  if (asset.kind === "logo") {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
    if (tenant.brand.logoAssetId) await retireAsset(tx, tenantId, tenant.brand.logoAssetId, null);
    await tx
      .update(tenants)
      .set({ brand: { ...tenant.brand, logoAssetId: asset.id } })
      .where(eq(tenants.id, tenantId));
  } else {
    await assertQuota(tx, tenantId, "photos");
  }
  const [restored] = await tx
    .update(assets)
    .set({ status: "active", replacedById: null, purgeAfter: null })
    .where(eq(assets.id, asset.id))
    .returning();
  return restored;
}

/** Options des listes : `photosOnly` écarte le logo du site (géré à part). */
type ListOptions = { photosOnly?: boolean };

export async function listActiveAssets(tx: Transaction, tenantId: string, options: ListOptions = {}) {
  return tx
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.tenantId, tenantId),
        eq(assets.status, "active"),
        options.photosOnly ? ne(assets.kind, "logo") : undefined,
      ),
    )
    .orderBy(asc(assets.sortOrder), asc(assets.createdAt));
}

/** Photos mises de côté encore récupérables. */
export async function listRetiredAssets(tx: Transaction, tenantId: string, options: ListOptions = {}) {
  return tx
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.tenantId, tenantId),
        eq(assets.status, "replaced"),
        gt(assets.purgeAfter, new Date()),
        options.photosOnly ? ne(assets.kind, "logo") : undefined,
      ),
    )
    .orderBy(desc(assets.updatedAt));
}
