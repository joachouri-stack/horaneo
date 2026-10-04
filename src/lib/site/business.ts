import "server-only";
import { withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessOfManageToken } from "@/modules/booking/manage";
import { businessOfServices } from "@/modules/businesses/businesses";

/**
 * Site public à plusieurs entreprises : chaque action de réservation travaille
 * pour UNE entreprise, déduite de ce que la cliente a choisi (les prestations)
 * ou de son lien de gestion. Les données privées des autres restent invisibles.
 */

/** Exécute fn pour l'entreprise qui réalise ces prestations. */
export async function withServicesBusiness<T>(
  tenantId: string,
  serviceIds: string[],
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const businessId = await withTenant(
    tenantId,
    (tx) => businessOfServices(tx, tenantId, serviceIds),
    undefined,
    null,
  );
  return withTenant(tenantId, fn, undefined, businessId);
}

/** Exécute fn pour l'entreprise du rendez-vous (aucune si le lien est inconnu). */
export async function withTokenBusiness<T>(
  tenantId: string,
  token: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const businessId = await withTenant(
    tenantId,
    (tx) => businessOfManageToken(tx, tenantId, token),
    undefined,
    null,
  );
  return withTenant(tenantId, fn, undefined, businessId);
}
