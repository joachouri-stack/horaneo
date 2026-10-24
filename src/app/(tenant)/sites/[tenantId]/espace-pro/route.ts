import { publicAppUrl } from "@/config/env";
import { getSite } from "@/lib/site/load";

/**
 * Lien « Espace professionnel » du site d'un établissement (institut.fr/espace-pro) :
 * renvoie la professionnelle vers la connexion à son espace de gestion, sur la plateforme.
 */
export async function GET(_request: Request, { params }: RouteContext<"/sites/[tenantId]/espace-pro">) {
  const site = await getSite((await params).tenantId);
  const target = new URL(`${publicAppUrl()}/${site.locale}/connexion`);
  target.searchParams.set("suite", "/espace");
  return Response.redirect(target, 307);
}
