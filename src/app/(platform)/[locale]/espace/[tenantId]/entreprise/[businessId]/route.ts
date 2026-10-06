import { cookies } from "next/headers";
import { resolveLocale } from "@/i18n/translator";
import { requireAdmin } from "@/lib/auth/session";
import { ADMIN_BUSINESS_COOKIE } from "@/lib/manager/access";

/**
 * « Voir comme le client » sur un site à plusieurs entreprises : l'administratrice
 * choisit l'entreprise dont elle ouvre l'espace (retenue jusqu'au prochain choix).
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/[locale]/espace/[tenantId]/entreprise/[businessId]">,
) {
  const { locale: rawLocale, tenantId, businessId } = await context.params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(tenantId) || !uuid.test(businessId)) return new Response(null, { status: 404 });
  const locale = resolveLocale(rawLocale);
  await requireAdmin(locale);
  (await cookies()).set(ADMIN_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    // Derrière le proxy de production, la requête arrive en http : on se fie à l'environnement.
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  // Adresse relative : request.url est l'adresse interne du serveur (localhost) derrière le proxy.
  return new Response(null, { status: 303, headers: { Location: `/${locale}/espace/${tenantId}` } });
}
