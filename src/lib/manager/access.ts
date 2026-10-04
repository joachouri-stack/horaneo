import "server-only";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { cache } from "react";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { memberships, plans, tenants, users, type PlanFeatures, type PlanLimits } from "@/db/schema";
import { resolveManagerRole, type ManagerRole } from "./role";

export { resolveManagerRole, type ManagerRole };
import { toActionError, type ActionResult } from "@/lib/actions/result";
import { recordAudit } from "@/lib/audit";
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
      features: plans.features,
      limits: plans.limits,
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
  const role = await resolveManagerRole(session, tenantId);
  if (!role) notFound();
  const tenant = await withTenant(tenantId, (tx) => loadManagerTenant(tx, tenantId));
  if (!tenant) notFound();
  return { session, role, tenant, userId: session.user.id };
});

/** Pour les lectures dans une action : droits revérifiés, rôle du tenant. */
export async function managerQuery<T>(tenantId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const session = await getCurrentSession();
  if (!session || !(await resolveManagerRole(session, tenantId))) throw new AppError("not_found");
  return withTenant(tenantId, fn);
}

/**
 * Modification par la gérante (ou l'administratrice en « voir comme le client ») :
 * droits revérifiés, transaction avec le rôle du tenant, journal si c'est l'administratrice.
 */
export async function managerMutation<T>(
  tenantId: string,
  action: string,
  fn: (tx: Transaction, context: { userId: string; role: ManagerRole }) => Promise<T>,
): Promise<ActionResult<T>> {
  const session = await getCurrentSession();
  const role = session ? await resolveManagerRole(session, tenantId) : null;
  if (!session || !role) throw new Error("Accès refusé");
  try {
    const data = await withTenant(tenantId, (tx) => fn(tx, { userId: session.user.id, role }));
    if (role === "admin") {
      await withPlatform((tx) =>
        recordAudit(tx, { actorUserId: session.user.id, action: `impersonation.${action}`, tenantId }),
      );
    }
    refresh();
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
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
