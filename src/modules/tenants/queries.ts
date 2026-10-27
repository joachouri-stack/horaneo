import { tenantFeatures, tenantLimits } from "@/modules/billing/entitlements";
import { and, asc, count, desc, eq, gte, inArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  businesses,
  memberships,
  plans,
  tenantDomains,
  tenants,
  updateRequests,
  usageCounters,
  users,
} from "@/db/schema";
import { countUsage } from "@/modules/quotas";

/** Lectures de l'espace admin (rôle plateforme : tous les tenants). */

export type TenantFilters = { q?: string; plan?: string; status?: string };

const STATUSES = ["draft", "active", "suspended", "cancelled", "deleted"] as const;

/** Mois en cours au format AAAA-MM dans un fuseau donné. */
export function currentPeriod(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Lettres accentuées et leur version sans accent (recherche insensible aux accents). */
const ACCENTED = "àâäáãåçéèêëíìîïñóòôöõúùûüýÿ";
const PLAIN = "aaaaaaceeeeiiiinooooouuuuyy";

/** Texte en minuscules et sans accents, côté base (sans extension). */
const fold = (value: SQL | AnyColumn) => sql`translate(lower(${value}), ${ACCENTED}, ${PLAIN})`;

/** Même transformation, côté application, pour le texte recherché. */
export function foldSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Conditions de la liste des clients : recherche (nom, adresse, e-mail, ville, domaine,
 * entreprises du site et e-mails de leurs gérantes, sans tenir compte des accents), pack, statut.
 */
function tenantConditions(filters: TenantFilters) {
  const conditions: SQL[] = [];
  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${foldSearch(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(
      or(
        sql`${fold(tenants.name)} like ${pattern}`,
        sql`${fold(tenants.slug)} like ${pattern}`,
        sql`${fold(tenants.email)} like ${pattern}`,
        sql`${fold(tenants.city)} like ${pattern}`,
        sql`exists (select 1 from ${tenantDomains} d where d.tenant_id = ${tenants.id} and lower(d.hostname) like ${pattern})`,
        sql`exists (select 1 from ${businesses} b where b.tenant_id = ${tenants.id} and (${fold(sql`b.name`)} like ${pattern} or ${fold(sql`b.email`)} like ${pattern}))`,
        sql`exists (select 1 from ${memberships} m join ${users} u on u.id = m.user_id where m.tenant_id = ${tenants.id} and (${fold(sql`u.email`)} like ${pattern} or ${fold(sql`u.name`)} like ${pattern}))`,
      )!,
    );
  }
  if (filters.plan) conditions.push(eq(plans.code, filters.plan));
  if (filters.status && (STATUSES as readonly string[]).includes(filters.status)) {
    conditions.push(eq(tenants.status, filters.status as (typeof STATUSES)[number]));
  } else {
    conditions.push(inArray(tenants.status, ["draft", "active", "suspended", "cancelled"]));
  }
  return and(...conditions);
}

/** Clients correspondant aux filtres, les plus récents d'abord (`limit` : taille de la tranche affichée). */
export async function listTenants(tx: Transaction, filters: TenantFilters = {}, limit = 200) {
  return tx
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      city: tenants.city,
      planCode: plans.code,
      planName: plans.name,
      createdAt: tenants.createdAt,
      primaryHostname: sql<
        string | null
      >`(select d.hostname from ${tenantDomains} d where d.tenant_id = ${tenants.id} and d.is_primary limit 1)`,
    })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(tenantConditions(filters))
    .orderBy(desc(tenants.createdAt))
    .limit(limit);
}

/** Nombre total de clients correspondant aux filtres (la liste dit quand elle n'affiche pas tout). */
export async function countTenants(tx: Transaction, filters: TenantFilters = {}) {
  const [row] = await tx
    .select({ value: count() })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(tenantConditions(filters));
  return row?.value ?? 0;
}

export async function getTenantOverview(tx: Transaction, tenantId: string) {
  const [row] = await tx
    // Droits réels : ceux du pack, complétés par les options actives du site.
    .select({ tenant: tenants, plan: plans, features: tenantFeatures, limits: tenantLimits })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) return null;
  row.plan = { ...row.plan, features: row.features, limits: row.limits };
  const [businessRows, domains, managers, usage, servicesCount, membersCount, photosCount] =
    await Promise.all([
      tx
        .select()
        .from(businesses)
        .where(eq(businesses.tenantId, tenantId))
        .orderBy(desc(businesses.isPrimary), asc(businesses.sortOrder), asc(businesses.createdAt)),
      tx
        .select()
        .from(tenantDomains)
        .where(eq(tenantDomains.tenantId, tenantId))
        .orderBy(desc(tenantDomains.isPrimary), asc(tenantDomains.createdAt)),
      tx
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          lastLoginAt: users.lastLoginAt,
          businessId: memberships.businessId,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.tenantId, tenantId)),
      tx
        .select()
        .from(usageCounters)
        .where(
          and(
            eq(usageCounters.tenantId, tenantId),
            eq(usageCounters.period, currentPeriod(row.tenant.timezone)),
          ),
        ),
      countUsage(tx, tenantId, "services"),
      countUsage(tx, tenantId, "members"),
      countUsage(tx, tenantId, "photos"),
    ]);
  return {
    ...row,
    businesses: businessRows,
    domains,
    managers,
    usage: usage[0] ?? null,
    counts: { services: servicesCount, members: membersCount, photos: photosCount },
  };
}

export async function listPlans(tx: Transaction) {
  return tx.select().from(plans).orderBy(asc(plans.sortOrder));
}

/** Chiffres de l'accueil admin. */
export async function getDashboardStats(tx: Transaction, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const byPlan = await tx
    .select({
      code: plans.code,
      name: plans.name,
      priceCents: plans.priceCents,
      isPublic: plans.isPublic,
      count: count(tenants.id),
    })
    .from(plans)
    .leftJoin(tenants, and(eq(tenants.planId, plans.id), eq(tenants.status, "active")))
    .groupBy(plans.id)
    .orderBy(asc(plans.sortOrder));
  const [
    [{ value: newThisMonth }],
    [{ value: cancelledThisMonth }],
    [{ value: drafts }],
    [{ value: openRequests }],
  ] = await Promise.all([
    tx.select({ value: count() }).from(tenants).where(gte(tenants.createdAt, monthStart)),
    tx.select({ value: count() }).from(tenants).where(gte(tenants.cancelledAt, monthStart)),
    tx.select({ value: count() }).from(tenants).where(eq(tenants.status, "draft")),
    tx.select({ value: count() }).from(updateRequests).where(eq(updateRequests.status, "new")),
  ]);
  // Sites en création (les plus anciens d'abord) : listés sur l'accueil avec ce qu'il leur manque.
  const draftTenants = await tx
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.status, "draft"))
    .orderBy(asc(tenants.createdAt))
    .limit(10);
  // Clients Basic ayant atteint leur quota de réservations ce mois-ci.
  const basicAtLimit = await tx
    .select({
      id: tenants.id,
      name: tenants.name,
      bookings: usageCounters.onlineBookings,
      limits: plans.limits,
    })
    .from(usageCounters)
    .innerJoin(tenants, eq(tenants.id, usageCounters.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(
      and(
        eq(usageCounters.period, currentPeriod("Europe/Paris", now)),
        sql`(${plans.limits}->>'onlineBookingsPerMonth') is not null`,
        sql`${usageCounters.onlineBookings} >= (${plans.limits}->>'onlineBookingsPerMonth')::int`,
      ),
    );
  return {
    byPlan,
    activeClients: byPlan.reduce((sum, plan) => sum + plan.count, 0),
    /** Revenu mensuel estimé des abonnements actifs (en centimes). */
    monthlyRevenueCents: byPlan.reduce((sum, plan) => sum + plan.count * plan.priceCents, 0),
    newThisMonth,
    cancelledThisMonth,
    drafts,
    draftTenants,
    openRequests,
    basicAtLimit,
  };
}
