import { getSite } from "@/lib/site/load";
import { siteBaseUrl } from "@/lib/site/urls";
import { visibleSections } from "@/modules/site/data";
import { categoryPath, SITE_PATHS } from "@/modules/site/paths";
import { renderSitemap, sitemapPaths } from "@/modules/site/seo";

/** Plan du site (institut-lea.fr/sitemap.xml), réécrit ici par le proxy. */
export async function GET(_request: Request, { params }: RouteContext<"/sites/[tenantId]/seo/sitemap">) {
  const site = await getSite((await params).tenantId);
  const paths =
    site.tenant.status === "active"
      ? sitemapPaths(site, visibleSections(site), SITE_PATHS, categoryPath)
      : [];
  return new Response(renderSitemap(siteBaseUrl(site), paths, new Date()), {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

/** Toujours calculé à la demande (propre à chaque site). */
export const dynamic = "force-dynamic";
