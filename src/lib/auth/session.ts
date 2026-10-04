import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { withPlatform } from "@/db/access";
import { memberships, tenants } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/locales";
import { decideAdminAccess } from "./admin-access";
import { getAuth } from "./auth";
import { getAdminSecurityState } from "./two-factor-service";

/** Session de la personne connectée (lue une seule fois par requête). */
export const getCurrentSession = cache(async () => {
  // headers() d'abord : la page devient dynamique (jamais pré-générée au build).
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

export type CurrentSession = NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>;

/** Exige une connexion ; sinon renvoie vers la page de connexion, puis ici. */
export async function requireSession(locale: Locale, returnTo: string): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    redirect({ href: { pathname: "/connexion", query: { suite: returnTo } }, locale });
  }
  return session!;
}

/** Établissements gérés par une personne (rôle gérante). */
export async function getManagedTenants(userId: string) {
  return withPlatform((tx) =>
    tx
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, userId))
      .orderBy(tenants.name),
  );
}

/**
 * Exige l'accès complet à l'espace admin (administratrice + double vérification).
 * Une personne qui n'est pas administratrice reçoit une page « introuvable ».
 */
export async function requireAdmin(locale: Locale): Promise<CurrentSession> {
  const session = await requireSession(locale, "/admin");
  const state = await getAdminSecurityState(session.user.id);
  const access = decideAdminAccess({
    isPlatformAdmin: state.isPlatformAdmin,
    twoFactorConfirmed: state.twoFactorConfirmed,
    sessionVerifiedAt: session.session.twoFactorVerifiedAt
      ? new Date(session.session.twoFactorVerifiedAt)
      : null,
  });
  if (access === "not_found") notFound();
  if (access === "setup_required") redirect({ href: "/admin/securite", locale });
  if (access === "verification_required") redirect({ href: "/admin/verification", locale });
  return session;
}

/** Exige une administratrice connectée, avant la double vérification (pages de code). */
export async function requireAdminBeforeTwoFactor(locale: Locale, returnTo: string) {
  const session = await requireSession(locale, returnTo);
  const state = await getAdminSecurityState(session.user.id);
  if (!state.isPlatformAdmin) notFound();
  return { session, state };
}
