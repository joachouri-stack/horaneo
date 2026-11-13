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
import { canAccess, type ManagerArea, type SpaceAccess } from "@/modules/team/access";
import { resolveManagerAccess, resolveManagerRole, type ManagerAccess, type ManagerRole } from "./role";

export { resolveManagerRole, type ManagerRole };

/** Entreprise choisie par l'administratrice en « voir comme le client » (site à plusieurs entreprises). */
export const ADMIN_BUSINESS_COOKIE = "espace_entreprise";

async function preferredBusiness() {
  return (await cookies()).get(ADMIN_BUSINESS_COOKIE)?.value ?? null;
}

async function currentAccess(tenantId: string) {
  const session = await getCurrentSession();
  const access = session ? await resolveManagerAccess(session, tenantId, await preferredBusiness()) : null;
  return session && access ? { session, ...access, space: spaceOf(access) } : null;
}

/** Droits dans l'espace (gérante et administratrice : tout ; collaborateur : ce que la gérante a ouvert). */
function spaceOf(access: ManagerAccess): SpaceAccess {
  return { role: access.role, permissions: access.permissions, staffMemberId: access.staffMemberId };
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
 * - « collaborator » : un membre de son équipe, limité aux parties qu'elle lui
 *   a ouvertes (chaque page et chaque action déclare sa partie, voir
 *   src/modules/team/access.ts : tout ce qui n'est pas ouvert est refusé) ;
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
  const { role, businessId, permissions, staffMemberId } = access;
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
  return {
    session,
    role,
    ...loaded,
    businessId,
    userId: session.user.id,
    permissions,
    staffMemberId,
    space: spaceOf(access),
  };
});

/** Contexte d'une modification : qui agit, avec quels droits, pour quelle entreprise. */
export type ManagerContext = { userId: string; role: ManagerRole; businessId: string; space: SpaceAccess };

/** Pour les lectures dans une action : droits revérifiés, rôle du tenant, entreprise de la gérante. */
export async function managerQuery<T>(
  tenantId: string,
  area: ManagerArea,
  fn: (tx: Transaction, context: ManagerContext) => Promise<T>,
): Promise<T> {
  const access = await currentAccess(tenantId);
  if (!access) throw new AppError("not_found");
  if (!canAccess(access.space, area)) throw new AppError("forbidden_area");
  const context = {
    userId: access.session.user.id,
    role: access.role,
    businessId: access.businessId,
    space: access.space,
  };
  return withTenant(tenantId, (tx) => fn(tx, context), undefined, access.businessId);
}

/**
 * Modification par la gérante (ou l'administratrice en « voir comme le client ») :
 * droits revérifiés, transaction avec le rôle du tenant, journal si c'est l'administratrice.
 */
export async function managerMutation<T>(
  tenantId: string,
  area: ManagerArea,
  action: string,
  fn: (tx: Transaction, context: ManagerContext) => Promise<T>,
): Promise<ActionResult<T>> {
  const access = await currentAccess(tenantId);
  // Session expirée ou accès retiré : message à l'écran plutôt qu'une page d'erreur.
  if (!access) return { ok: false, error: "session_expired" };
  // Partie de l'espace que la gérante n'a pas ouverte à ce collaborateur.
  if (!canAccess(access.space, area)) return { ok: false, error: "forbidden_area" };
  const { session, role, businessId, space } = access;
  try {
    const data = await withTenant(
      tenantId,
      (tx) => fn(tx, { userId: session.user.id, role, businessId, space }),
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
  // Session expirée ou accès retiré : message à l'écran plutôt qu'une page d'erreur.
  if (!access) return { ok: false, error: "session_expired" };
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
  // Fiche de l'établissement (Stripe, abonnement, accès de l'équipe) : jamais un collaborateur.
  if (!canAccess(access.space, "owner")) throw new AppError("forbidden_area");
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

/** Établissements dont une personne ouvre l'espace (gérante ou collaborateur), pour choisir lequel ouvrir. */
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

/**
 * Modification réservée à la gérante qui s'écrit avec le rôle plateforme (ex. les
 * accès de son équipe) : droits revérifiés, journalisée, résultat de formulaire.
 */
export async function managerPlatformMutation<T>(
  tenantId: string,
  action: string,
  fn: (tx: Transaction, context: { businessId: string; userId: string }) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const data = await managerPlatformAction(tenantId, action, fn);
    refresh();
    // Invitation envoyée tout de suite.
    sendQueuedSoon();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found" && !(await currentAccess(tenantId)))
      return { ok: false, error: "session_expired" };
    return toActionError(error);
  }
}
