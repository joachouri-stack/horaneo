import { and, asc, count, eq, gt, inArray } from "drizzle-orm";
import { retireAsset } from "@/modules/media/assets";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import {
  appointments,
  assets,
  openingHours,
  services,
  staffMembers,
  staffSchedules,
  staffServices,
  tenants,
} from "@/db/schema";
import { HEX_COLOR } from "@/lib/colors";
import { setLocalized } from "@/modules/content/localized";
import { AppError } from "@/modules/errors";
import { assertQuota } from "@/modules/quotas";

/** Membres de l'équipe et prestations qu'ils réalisent. */

export const staffInput = z.object({
  name: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(1000).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
  isActive: z.boolean().default(true),
  serviceIds: z.array(z.uuid()).default([]),
  photoAssetId: z.uuid().nullable().optional(),
});

export async function listStaff(tx: Transaction, tenantId: string) {
  const members = await tx
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.tenantId, tenantId))
    .orderBy(asc(staffMembers.sortOrder), asc(staffMembers.createdAt));
  const links = await tx.select().from(staffServices).where(eq(staffServices.tenantId, tenantId));
  const days = await tx
    .selectDistinct({ staffId: staffSchedules.staffId, weekday: staffSchedules.weekday })
    .from(staffSchedules)
    .where(eq(staffSchedules.tenantId, tenantId));
  const photoIds = members.map((member) => member.photoAssetId).filter((id) => id !== null);
  const photos = photoIds.length
    ? await tx
        .select({ id: assets.id, storageKey: assets.storageKey })
        .from(assets)
        .where(and(eq(assets.tenantId, tenantId), eq(assets.status, "active"), inArray(assets.id, photoIds)))
    : [];
  return members.map((member) => ({
    ...member,
    serviceIds: links.filter((link) => link.staffId === member.id).map((link) => link.serviceId),
    /** Jours travaillés (1 = lundi), d'après ses horaires. */
    workDays: days
      .filter((day) => day.staffId === member.id)
      .map((day) => day.weekday)
      .sort((a, b) => a - b),
    /** Photo en cours (clé de stockage), ou null. */
    photoKey: photos.find((photo) => photo.id === member.photoAssetId)?.storageKey ?? null,
  }));
}

/** Photo d'un membre : une photo « équipe » de l'établissement, ou null pour la retirer. */
export async function setStaffPhoto(
  tx: Transaction,
  tenantId: string,
  staffId: string,
  assetId: string | null,
) {
  const [member] = await tx
    .select({ id: staffMembers.id, photoAssetId: staffMembers.photoAssetId })
    .from(staffMembers)
    .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, tenantId)));
  if (!member) throw new AppError("not_found");
  if (assetId) {
    const [asset] = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.tenantId, tenantId), eq(assets.kind, "staff")));
    if (!asset) throw new AppError("not_found");
  }
  const [updated] = await tx
    .update(staffMembers)
    .set({ photoAssetId: assetId })
    .where(eq(staffMembers.id, member.id))
    .returning();
  // Ancienne photo mise de côté : elle ne compte plus dans les photos du pack.
  if (member.photoAssetId && member.photoAssetId !== assetId)
    await retireAsset(tx, tenantId, member.photoAssetId, assetId);
  return updated;
}

async function setServices(tx: Transaction, tenantId: string, staffId: string, serviceIds: string[]) {
  await tx
    .delete(staffServices)
    .where(and(eq(staffServices.tenantId, tenantId), eq(staffServices.staffId, staffId)));
  if (serviceIds.length === 0) return;
  const valid = await tx
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.tenantId, tenantId), inArray(services.id, serviceIds)));
  if (valid.length > 0) {
    await tx
      .insert(staffServices)
      .values(valid.map((service) => ({ tenantId, staffId, serviceId: service.id })));
  }
}

export async function saveStaff(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof staffInput>,
  staffId?: string,
) {
  const input = staffInput.parse(raw);
  const [tenant] = await tx
    .select({ locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");

  if (staffId) {
    const [existing] = await tx
      .select()
      .from(staffMembers)
      .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, tenantId)));
    if (!existing) throw new AppError("not_found");
    // Seuls les membres actifs comptent dans le pack : une réactivation est contrôlée.
    if (!existing.isActive && input.isActive) await assertQuota(tx, tenantId, "members");
    const [updated] = await tx
      .update(staffMembers)
      .set({
        name: input.name,
        bio: setLocalized(existing.bio, tenant.locale, input.bio),
        color: input.color ?? existing.color,
        isActive: input.isActive,
        ...(input.photoAssetId !== undefined ? { photoAssetId: input.photoAssetId } : {}),
      })
      .where(eq(staffMembers.id, existing.id))
      .returning();
    await setServices(tx, tenantId, existing.id, input.serviceIds);
    return updated;
  }

  if (input.isActive) await assertQuota(tx, tenantId, "members");
  const [{ value: position }] = await tx
    .select({ value: count() })
    .from(staffMembers)
    .where(eq(staffMembers.tenantId, tenantId));
  const [created] = await tx
    .insert(staffMembers)
    .values({
      tenantId,
      name: input.name,
      bio: setLocalized({}, tenant.locale, input.bio),
      color: input.color,
      isActive: input.isActive,
      photoAssetId: input.photoAssetId ?? null,
      sortOrder: position,
    })
    .returning();
  await setServices(tx, tenantId, created.id, input.serviceIds);
  // Par défaut, un nouveau membre travaille aux horaires d'ouverture (modifiable ensuite).
  const hours = await tx
    .select()
    .from(openingHours)
    .where(and(eq(openingHours.tenantId, tenantId), eq(openingHours.businessId, created.businessId)));
  if (hours.length > 0) {
    await tx.insert(staffSchedules).values(
      hours.map((range) => ({
        tenantId,
        staffId: created.id,
        weekday: range.weekday,
        startsAt: range.opensAt,
        endsAt: range.closesAt,
      })),
    );
  }
  return created;
}

/** Supprime un membre ; s'il a déjà des rendez-vous, il est seulement désactivé. */
export async function deleteStaff(tx: Transaction, tenantId: string, staffId: string, now = new Date()) {
  const [existing] = await tx
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, tenantId)));
  if (!existing) throw new AppError("not_found");
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.delete(staffMembers).where(eq(staffMembers.id, staffId));
    });
    if (existing.photoAssetId) await retireAsset(tx, tenantId, existing.photoAssetId);
    return { deleted: true, upcoming: 0 };
  } catch (error) {
    // Seulement si des rendez-vous y sont rattachés (clé étrangère) : désactivé à la place.
    const err = error as { code?: string; cause?: { code?: string } };
    if ((err.code ?? err.cause?.code) !== "23503") throw error;
    await tx.update(staffMembers).set({ isActive: false }).where(eq(staffMembers.id, staffId));
    const [{ upcoming }] = await tx
      .select({ upcoming: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.staffId, staffId),
          gt(appointments.startsAt, now),
          inArray(appointments.status, ["confirmed", "pending_payment"]),
        ),
      );
    return { deleted: false, upcoming };
  }
}
