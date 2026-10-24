import { tenantFeatures, tenantLimits } from "@/modules/billing/entitlements";
import "server-only";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { cache } from "react";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  businesses,
  memberships,
  plans,
  tenants,
  users,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { cookies } from "next/headers";
import { resolveManagerAccess, resolveManagerRole, type ManagerRole } from "./role";

export { resolveManagerRole, type ManagerRole };

/** Entreprise choisie par l'administratrice en « voir comme le client » (site à plusieurs entreprises). */
export const ADMIN_BUSINESS_COOKIE = "espace_entreprise";

async function preferredBusiness() {
  return (await cookies()).get(ADMIN_BUSINESS_COOKIE)?.value ?? null;
}

async function currentAccess(tenantId: string) {
  const session = await getCurrentSession();
  const access = session ? await resolveManagerAccess(session, tenantId, await preferredBusiness()) : null;
  return session && access ? { session, ...access } : null;
}
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { recordAudit } from "@/lib/audit";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { getCurrentSession, requireSession } from "@/lib/auth/session";
import type { Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";

/**
 * Accès à l'espace gérante d'un établissement :
 * - « owner » : la gérante (rattachée à l'établissement) ;
 * - « admin » : l'administratrice qui utilise « voir comme le client »
 *   (double vérification exigée ; chacune de ses modifications est journalisée).
 * Les données sont ensuite lues et écrites avec le rôle du tenant : la base
 * garantit qu'aucune donnée d'un autre établissement n'est accessible.
 */

/** Informations de l'établissement utiles à l'espace gérante. */
export async function loadManagerTenant(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({
      tenant: tenants,
      planCode: plans.code,
      planName: plans.name,
      features: tenantFeatures,
      limits: tenantLimits,
    })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) return null;
  return {
    ...row.tenant,
    planCode: row.planCode,
    planName: row.planName,
    features: row.features as PlanFeatures,
    limits: row.limits as PlanLimits,
  };
}

export type ManagerTenant = NonNullable<Awaited<ReturnType<typeof loadManagerTenant>>>;

/** Pour les pages : exige l'accès, sinon page de connexion ou « introuvable ». */
export const requireManager = cache(async (locale: Locale, tenantId: string) => {
  const session = await requireSession(locale, `/espace/${tenantId}`);
  const access = await resolveManagerAccess(session, tenantId, await preferredBusiness());
  if (!access) notFound();
  const { role, businessId } = access;
  const loaded = await withTenant(
    tenantId,
    async (tx) => {
      const tenant = await loadManagerTenant(tx, tenantId);
      const [business] = await tx.select().from(businesses).where(eq(businesses.id, businessId));
      const others = await tx
        .select({ id: businesses.id })
        .from(businesses)
        .where(eq(businesses.tenantId, tenantId));
      return tenant && business ? { tenant, business, multiBusiness: others.length > 1 } : null;
    },
    undefined,
    businessId,
  );
  if (!loaded) notFound();
  return { session, role, ...loaded, businessId, userId: session.user.id };
});

/** Pour les lectures dans une action : droits revérifiés, rôle du tenant, entreprise de la gérante. */
export async function managerQuery<T>(tenantId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const access = await currentAccess(tenantId);
  if (!access) throw new AppError("not_found");
  return withTenant(tenantId, fn, undefined, access.businessId);
}

/**
 * Modification par la gérante (ou l'administratrice en « voir comme le client ») :
 * droits revérifiés, transaction avec le rôle du tenant, journal si c'est l'administratrice.
 */
export async function managerMutation<T>(
  tenantId: string,
  action: string,
  fn: (tx: Transaction, context: { userId: string; role: ManagerRole; businessId: string }) => Promise<T>,
): Promise<ActionResult<T>> {
  const access = await currentAccess(tenantId);
  if (!access) throw new Error("Accès refusé");
  const { session, role, businessId } = access;
  try {
    const data = await withTenant(
      tenantId,
      (tx) => fn(tx, { userId: session.user.id, role, businessId }),
      undefined,
      businessId,
    );
    if (role === "admin") {
      await withPlatform((tx) =>
        recordAudit(tx, { actorUserId: session.user.id, action: `impersonation.${action}`, tenantId }),
      );
    }
    refresh();
    // Messages éventuels (annulation, déplacement…) envoyés tout de suite.
    sendQueuedSoon();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Réglage personnel de la gérante (ex. notifications sur son téléphone) :
 * droits revérifiés, rôle plateforme. Refusé à l'administratrice qui regarde
 * l'espace « comme le client » : ce sont les appareils de la gérante.
 */
export async function managerPersonalAction<T>(
  tenantId: string,
  fn: (tx: Transaction, context: { userId: string }) => Promise<T>,
): Promise<ActionResult<T>> {
  const access = await currentAccess(tenantId);
  if (!access) throw new Error("Accès refusé");
  try {
    if (access.role === "admin") throw new AppError("personal_setting");
    return { ok: true, data: await withPlatform((tx) => fn(tx, { userId: access.session.user.id })) };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Action de la gérante qui modifie la fiche de l'établissement (ex. compte
 * Stripe) : droits revérifiés, puis rôle plateforme, toujours journalisée.
 */
export async function managerPlatformAction<T>(
  tenantId: string,
  action: string,
  fn: (tx: Transaction, context: { businessId: string; userId: string }) => Promise<T>,
): Promise<T> {
  const access = await currentAccess(tenantId);
  if (!access) throw new AppError("not_found");
  const { session, role, businessId } = access;
  return withPlatform(async (tx) => {
    const result = await fn(tx, { businessId, userId: session.user.id });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      action: role === "admin" ? `impersonation.${action}` : action,
      tenantId,
    });
    return result;
  });
}

/** Établissements gérés par une personne (pour choisir lequel ouvrir). */
export async function managedTenantIds(userId: string): Promise<string[]> {
  const rows = await withPlatform((tx) =>
    tx
      .select({ id: memberships.tenantId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.userId, userId)),
  );
  return rows.map((row) => row.id);
}
