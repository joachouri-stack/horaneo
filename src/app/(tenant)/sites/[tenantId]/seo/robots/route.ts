import { getSite, isPreview } from "@/lib/site/load";
import { siteBaseUrl } from "@/lib/site/urls";
import { SITE_PATHS } from "@/modules/site/paths";

/** Consignes pour les moteurs de recherche ; rien n'est indexé tant que le site n'est pas en ligne. */
export async function GET(_request: Request, { params }: RouteContext<"/sites/[tenantId]/seo/robots">) {
  const site = await getSite((await params).tenantId);
  const open = site.tenant.status === "active" && !(await isPreview());
  const body = open
    ? `User-agent: *\nAllow: /\nDisallow: ${SITE_PATHS.booking}\n\nSitemap: ${siteBaseUrl(site)}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}

/** Toujours calculé à la demande (propre à chaque site). */
export const dynamic = "force-dynamic";
