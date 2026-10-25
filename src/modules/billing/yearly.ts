/**
 * Facturation à l'année : le prix annuel d'un pack se calcule à partir de son
 * prix mensuel et du réglage « mois offerts » (yearly_free_months). Fonctions
 * pures, utilisées par Stripe, la commande et le site commercial : tous
 * affichent et facturent le même montant.
 */

export type BillingInterval = "month" | "year";

/** Prix annuel : 12 mois, moins les mois offerts (jamais négatif). */
export function yearlyPriceCents(monthlyCents: number, freeMonths: number) {
  const months = Math.max(1, 12 - Math.max(0, Math.floor(freeMonths)));
  return monthlyCents * months;
}

/** Équivalent mensuel d'un prix annuel (arrondi au centime). */
export function monthlyEquivalentCents(yearlyCents: number) {
  return Math.round(yearlyCents / 12);
}

/** Économie annuelle par rapport au paiement mensuel. */
export function yearlySavingCents(monthlyCents: number, freeMonths: number) {
  return monthlyCents * 12 - yearlyPriceCents(monthlyCents, freeMonths);
}

/** Lit une périodicité venant d'un formulaire ou d'une adresse (« year » ou mensuel par défaut). */
export function parseInterval(value: unknown): BillingInterval {
  return value === "year" ? "year" : "month";
}
