import { sql } from "drizzle-orm";
import { plans, tenants, type PlanFeatures, type PlanLimits } from "@/db/schema";

/**
 * Droits réels d'un site : ceux de son pack, complétés par ses options actives
 * (réservation, paiement en ligne, SMS…). À utiliser à la place de
 * `plans.features` / `plans.limits` dans toute requête qui joint `tenants` et `plans`.
 */
export const tenantFeatures = sql<PlanFeatures>`(${plans.features} || app_option_features(${tenants.id}))`;
export const tenantLimits = sql<PlanLimits>`(${plans.limits} || app_option_limits(${tenants.id}))`;
