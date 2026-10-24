import { tenantFeatures, tenantLimits } from "@/modules/billing/entitlements";
import { and, count, eq, ne, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { assets, plans, tenants, type PlanFeatures, type PlanLimits } from "@/db/schema";
import { AppError } from "./errors";

/** Limites du pack ; une valeur absente ou null signifie « illimité ». */
export type QuotaKey = "services" | "members" | "photos" | "customers";

export async function getTenantPlan(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ limits: tenantLimits, features: tenantFeatures, code: plans.code })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  return row as { limits: PlanLimits; features: PlanFeatures; code: string };
}

/**
 * Utilisation du pack, comptée au niveau du SITE (toutes entreprises confondues),
 * même quand la transaction ne voit que les données d'une entreprise.
 */
export async function countUsage(tx: Transaction, tenantId: string, key: QuotaKey): Promise<number> {
  if (key === "services" || key === "members" || key === "customers") {
    const rows = await tx.execute<{ value: number }>(
      sql`SELECT app_site_usage(${tenantId}::uuid, ${key}) AS value`,
    );
    return Number(rows[0]?.value ?? 0);
  }
  const [row] = await tx
    .select({ value: count() })
    .from(assets)
    // Le logo ne compte pas dans le nombre de photos du pack.
    .where(and(eq(assets.tenantId, tenantId), eq(assets.status, "active"), ne(assets.kind, "logo")));
  return row.value;
}

const LIMIT_FIELD: Record<QuotaKey, keyof PlanLimits> = {
  services: "services",
  members: "members",
  photos: "photos",
  customers: "customers",
};

/** Refuse l'ajout si le pack est déjà au maximum. */
export async function assertQuota(tx: Transaction, tenantId: string, key: QuotaKey, adding = 1) {
  const { limits } = await getTenantPlan(tx, tenantId);
  const limit = limits[LIMIT_FIELD[key]];
  if (limit === null || limit === undefined) return;
  if ((await countUsage(tx, tenantId, key)) + adding > limit) throw new AppError("quota_reached", key);
}

export async function assertFeature(tx: Transaction, tenantId: string, feature: keyof PlanFeatures) {
  const { features } = await getTenantPlan(tx, tenantId);
  if (!features[feature]) throw new AppError("feature_unavailable", String(feature));
}
