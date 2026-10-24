import { and, count, eq, inArray } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { memberships, openingHours, services, staffMembers, staffServices, tenants } from "@/db/schema";

/** Points vérifiés avant de mettre un site en ligne, dans l'ordre où on les complète. */
export const READINESS_KEYS = ["logo", "services", "team", "hours", "manager"] as const;
export type ReadinessKey = (typeof READINESS_KEYS)[number];

export type Readiness = { tenantId: string; done: Record<ReadinessKey, boolean>; missing: ReadinessKey[] };

/**
 * Ce qui est prêt sur chaque site (logo, prestations, équipe qui les assure,
 * horaires, gérante) : liste « À faire » de l'accueil et liste de contrôle de la
 * fiche. Rôle plateforme : lit plusieurs sites à la fois.
 */
export async function siteReadiness(tx: Transaction, tenantIds: string[]): Promise<Readiness[]> {
  if (tenantIds.length === 0) return [];
  const [rows, serviceCounts, staffCounts, hourCounts, managerCounts] = await Promise.all([
    tx.select({ id: tenants.id, brand: tenants.brand }).from(tenants).where(inArray(tenants.id, tenantIds)),
    tx
      .select({ tenantId: services.tenantId, value: count() })
      .from(services)
      .where(and(inArray(services.tenantId, tenantIds), eq(services.isActive, true)))
      .groupBy(services.tenantId),
    // Membre actif qui assure au moins une prestation : sinon personne ne peut être réservé.
    tx
      .selectDistinct({ tenantId: staffMembers.tenantId, staffId: staffMembers.id })
      .from(staffMembers)
      .innerJoin(staffServices, eq(staffServices.staffId, staffMembers.id))
      .where(and(inArray(staffMembers.tenantId, tenantIds), eq(staffMembers.isActive, true))),
    tx
      .select({ tenantId: openingHours.tenantId, value: count() })
      .from(openingHours)
      .where(inArray(openingHours.tenantId, tenantIds))
      .groupBy(openingHours.tenantId),
    tx
      .select({ tenantId: memberships.tenantId, value: count() })
      .from(memberships)
      .where(inArray(memberships.tenantId, tenantIds))
      .groupBy(memberships.tenantId),
  ]);
  const has = (list: { tenantId: string }[], tenantId: string) =>
    list.some((row) => row.tenantId === tenantId);
  return rows.map((row) => {
    const done: Record<ReadinessKey, boolean> = {
      logo: Boolean(row.brand?.logoAssetId),
      services: has(serviceCounts, row.id),
      team: has(staffCounts, row.id),
      hours: has(hourCounts, row.id),
      manager: has(managerCounts, row.id),
    };
    return { tenantId: row.id, done, missing: READINESS_KEYS.filter((key) => !done[key]) };
  });
}
