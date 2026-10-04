import "server-only";
import { loadTenantOverview } from "./tenant";

/** Paramètre d'adresse qui désigne l'entreprise modifiée dans l'espace admin. */
export const BUSINESS_PARAM = "entreprise";

/**
 * Entreprise dont l'administratrice modifie les informations (prestations,
 * équipe, horaires) : celle choisie dans l'adresse, sinon l'entreprise principale.
 */
export async function loadAdminBusiness(
  tenantId: string,
  query: Record<string, string | string[] | undefined>,
) {
  const overview = await loadTenantOverview(tenantId);
  const requested = query[BUSINESS_PARAM];
  const current = overview.businesses.find((business) => business.id === requested) ?? overview.businesses[0];
  return { overview, businesses: overview.businesses, business: current };
}
