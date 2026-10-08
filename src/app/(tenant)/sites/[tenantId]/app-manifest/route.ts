import { getSite } from "@/lib/site/load";
import { siteCta } from "@/modules/site/cta";
import { APP_PATHS, SITE_PATHS } from "@/modules/site/paths";
import { buildTheme } from "@/modules/site/theme";

/**
 * Fiche d'application du site d'un établissement : la cliente l'ajoute à son
 * écran d'accueil (icône à son logo) et arrive directement sur la réservation.
 */
export async function GET(_request: Request, { params }: RouteContext<"/sites/[tenantId]/app-manifest">) {
  const site = await getSite((await params).tenantId);
  const theme = buildTheme(site.tenant.theme, site.tenant.colors);
  const name = site.tenant.name;
  const startUrl = siteCta(site)?.kind === "book" ? SITE_PATHS.booking : SITE_PATHS.home;
  return Response.json(
    {
      name,
      short_name: name,
      start_url: startUrl,
      scope: "/",
      display: "standalone",
      background_color: theme.colors.bg,
      theme_color: theme.colors.bg,
      lang: site.locale,
      icons: [
        { src: APP_PATHS.icon(192), sizes: "192x192", type: "image/png" },
        { src: APP_PATHS.icon(512), sizes: "512x512", type: "image/png" },
        { src: APP_PATHS.icon(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } },
  );
}
