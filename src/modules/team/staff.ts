import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { openingHours, services, staffMembers, staffSchedules, staffServices, tenants } from "@/db/schema";
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
  return members.map((member) => ({
    ...member,
    serviceIds: links.filter((link) => link.staffId === member.id).map((link) => link.serviceId),
  }));
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

  await assertQuota(tx, tenantId, "members");
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
export async function deleteStaff(tx: Transaction, tenantId: string, staffId: string) {
  const [existing] = await tx
    .select()
    .from(staffMembers)
    .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, tenantId)));
  if (!existing) throw new AppError("not_found");
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.delete(staffMembers).where(eq(staffMembers.id, staffId));
    });
    return { deleted: true };
  } catch {
    await tx.update(staffMembers).set({ isActive: false }).where(eq(staffMembers.id, staffId));
    return { deleted: false };
  }
}
