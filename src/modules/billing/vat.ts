/**
 * TVA des prix affichés sur le site commercial. Fonctions pures : le taux et le
 * mode d'affichage (HT ou TTC) viennent des réglages (vat_rate_percent,
 * prices_display), comme pour la facturation Stripe.
 */

/** Prix TTC d'un prix HT, arrondi au centime (même calcul que la TVA ajoutée par Stripe). */
export function withVatCents(htCents: number, vatPercent: number) {
  return Math.round(htCents * (1 + Math.max(0, vatPercent) / 100));
}

/**
 * Montant TTC à afficher en complément d'un prix HT, ou null quand il n'apporte
 * rien : prix déjà affichés TTC, pas de TVA (franchise) ou prix nul.
 */
export function ttcHintCents(htCents: number, display: string, vatPercent: number) {
  if (display !== "HT" || !(vatPercent > 0) || htCents <= 0) return null;
  return withVatCents(htCents, vatPercent);
}
