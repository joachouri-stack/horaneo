import { resolveLocale } from "@/i18n/translator";
import { openStripeOnboarding } from "../../../actions";

/**
 * Stripe renvoie ici quand le lien des étapes guidées a expiré :
 * un nouveau lien est créé et la gérante reprend où elle en était.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/[locale]/espace/[tenantId]/plus/paiements/relance">,
) {
  const { locale, tenantId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return new Response(null, { status: 404 });
  return Response.redirect(await openStripeOnboarding(resolveLocale(locale), tenantId), 303);
}
