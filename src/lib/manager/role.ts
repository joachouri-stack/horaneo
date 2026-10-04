import { and, eq } from "drizzle-orm";
import { withPlatform } from "@/db/access";
import type { Database } from "@/db/client";
import { memberships } from "@/db/schema";
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
