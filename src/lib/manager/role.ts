import { and, eq } from "drizzle-orm";
import { withPlatform } from "@/db/access";
import type { Database } from "@/db/client";
import { businesses, memberships } from "@/db/schema";
import { decideAdminAccess } from "@/lib/auth/admin-access";
import { getAdminSecurityState } from "@/lib/auth/two-factor-service";

export type ManagerRole = "owner" | "admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLike = { user: { id: string }; session: { twoFactorVerifiedAt?: Date | string | null } };

export async function resolveManagerRole(
  session: SessionLike,
  tenantId: string,
  database?: Database,
): Promise<ManagerRole | null> {
  if (!UUID.test(tenantId)) return null;
  const membership = await withPlatform(
    (tx) =>
      tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, session.user.id), eq(memberships.tenantId, tenantId))),
    database,
  );
  if (membership.length > 0) return "owner";
  const state = await getAdminSecurityState(session.user.id, { database });
  const access = decideAdminAccess({
    isPlatformAdmin: state.isPlatformAdmin,
    twoFactorConfirmed: state.twoFactorConfirmed,
    sessionVerifiedAt: session.session.twoFactorVerifiedAt
      ? new Date(session.session.twoFactorVerifiedAt)
      : null,
  });
  return access === "granted" ? "admin" : null;
}

export type ManagerAccess = { role: ManagerRole; businessId: string };

/**
 * Droits et entreprise de la personne connectée sur un site :
 * - gérante : l'entreprise à laquelle elle est rattachée (elle ne voit qu'elle) ;
 * - administratrice (« voir comme le client ») : l'entreprise choisie, sinon la principale.
 */
export async function resolveManagerAccess(
  session: SessionLike,
  tenantId: string,
  preferredBusinessId?: string | null,
  database?: Database,
): Promise<ManagerAccess | null> {
  if (!UUID.test(tenantId)) return null;
  const [membership] = await withPlatform(
    (tx) =>
      tx
        .select({ businessId: memberships.businessId })
        .from(memberships)
        .where(and(eq(memberships.userId, session.user.id), eq(memberships.tenantId, tenantId))),
    database,
  );
  if (membership) return { role: "owner", businessId: membership.businessId };
  const role = await resolveManagerRole(session, tenantId, database);
  if (role !== "admin") return null;
  const rows = await withPlatform(
    (tx) =>
      tx
        .select({ id: businesses.id, isPrimary: businesses.isPrimary })
        .from(businesses)
        .where(eq(businesses.tenantId, tenantId)),
    database,
  );
  const chosen =
    rows.find((row) => row.id === preferredBusinessId) ?? rows.find((row) => row.isPrimary) ?? rows[0];
  return chosen ? { role: "admin", businessId: chosen.id } : null;
}
