import { and, eq } from "drizzle-orm";
import { withPlatform } from "@/db/access";
import type { Database } from "@/db/client";
import { businesses, memberships, staffMembers, type CollaboratorPermissions } from "@/db/schema";
import { decideAdminAccess } from "@/lib/auth/admin-access";
import { getAdminSecurityState } from "@/lib/auth/two-factor-service";

/** « owner » : la gérante ; « collaborator » : un membre de son équipe ; « admin » : « voir comme le client ». */
export type ManagerRole = "owner" | "collaborator" | "admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionLike = { user: { id: string }; session: { twoFactorVerifiedAt?: Date | string | null } };

export async function resolveManagerRole(
  session: SessionLike,
  tenantId: string,
  database?: Database,
): Promise<ManagerRole | null> {
  if (!UUID.test(tenantId)) return null;
  const [membership] = await withPlatform(
    (tx) =>
      tx
        .select({ role: memberships.role, staffActive: staffMembers.isActive })
        .from(memberships)
        .leftJoin(
          staffMembers,
          and(
            eq(staffMembers.tenantId, memberships.tenantId),
            eq(staffMembers.id, memberships.staffMemberId),
          ),
        )
        .where(and(eq(memberships.userId, session.user.id), eq(memberships.tenantId, tenantId))),
    database,
  );
  if (membership?.role === "collaborator" && !membership.staffActive) return null;
  if (membership) return membership.role;
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

export type ManagerAccess = {
  role: ManagerRole;
  businessId: string;
  /** Collaborateur : droits choisis par la gérante (vide sinon : tout est ouvert). */
  permissions: CollaboratorPermissions;
  /** Collaborateur : son membre d'équipe. */
  staffMemberId: string | null;
};

/**
 * Droits et entreprise de la personne connectée sur un site :
 * - gérante ou collaborateur : l'entreprise à laquelle il est rattaché (il ne voit qu'elle) ;
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
        .select({
          role: memberships.role,
          businessId: memberships.businessId,
          permissions: memberships.permissions,
          staffMemberId: memberships.staffMemberId,
          staffActive: staffMembers.isActive,
        })
        .from(memberships)
        .leftJoin(
          staffMembers,
          and(
            eq(staffMembers.tenantId, memberships.tenantId),
            eq(staffMembers.id, memberships.staffMemberId),
          ),
        )
        .where(and(eq(memberships.userId, session.user.id), eq(memberships.tenantId, tenantId))),
    database,
  );
  // Collaborateur dont le membre d'équipe est désactivé (parti du salon) : plus d'accès.
  if (membership?.role === "collaborator" && !membership.staffActive) return null;
  if (membership)
    return membership.role === "owner"
      ? { role: "owner", businessId: membership.businessId, permissions: {}, staffMemberId: null }
      : {
          role: "collaborator",
          businessId: membership.businessId,
          permissions: membership.permissions,
          staffMemberId: membership.staffMemberId,
        };
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
  return chosen ? { role: "admin", businessId: chosen.id, permissions: {}, staffMemberId: null } : null;
}
