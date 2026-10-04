import { cookies } from "next/headers";
import { resolveLocale } from "@/i18n/translator";
import { requireAdmin } from "@/lib/auth/session";
import { ADMIN_BUSINESS_COOKIE } from "@/lib/manager/access";

/**
 * « Voir comme le client » sur un site à plusieurs entreprises : l'administratrice
 * choisit l'entreprise dont elle ouvre l'espace (retenue jusqu'au prochain choix).
 */
export async function GET(
  request: Request,
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
    secure: new URL(request.url).protocol === "https:",
    path: "/",
  });
  return Response.redirect(new URL(`/${locale}/espace/${tenantId}`, request.url), 303);
}
