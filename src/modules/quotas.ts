import { and, count, eq, ne } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  assets,
  plans,
  services,
  staffMembers,
  tenants,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { AppError } from "./errors";

/** Limites du pack ; une valeur absente ou null signifie « illimité ». */
export type QuotaKey = "services" | "members" | "photos";

export async function getTenantPlan(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ limits: plans.limits, features: plans.features, code: plans.code })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  return row as { limits: PlanLimits; features: PlanFeatures; code: string };
}

export async function countUsage(tx: Transaction, tenantId: string, key: QuotaKey): Promise<number> {
  const [row] =
    key === "services"
      ? await tx.select({ value: count() }).from(services).where(eq(services.tenantId, tenantId))
      : key === "members"
        ? await tx.select({ value: count() }).from(staffMembers).where(eq(staffMembers.tenantId, tenantId))
        : await tx
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
