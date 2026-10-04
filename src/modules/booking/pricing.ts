/**
 * Totaux d'un rendez-vous (1 à 3 prestations) et acompte.
 * Choix validés : les durées s'additionnent ; les temps de battement aussi,
 * placés à la fin ; l'acompte se calcule sur le total après réduction.
 */

export type PricedService = {
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  currency: string;
};

export function computeTotals(services: PricedService[]) {
  if (services.length === 0) throw new Error("Aucune prestation");
  const currency = services[0].currency;
  if (services.some((service) => service.currency !== currency)) throw new Error("Devises différentes");
  return {
    durationMinutes: services.reduce((sum, service) => sum + service.durationMinutes, 0),
    bufferMinutes: services.reduce((sum, service) => sum + service.bufferMinutes, 0),
    totalCents: services.reduce((sum, service) => sum + service.priceCents, 0),
    currency,
  };
}

export type DepositSettings = {
  depositEnabled: boolean;
  depositType: "percent" | "fixed";
  depositValue: number;
};

/** Acompte en centimes (0 si désactivé ou si le pack n'inclut pas le paiement en ligne). */
export function computeDeposit(
  totalCents: number,
  settings: DepositSettings,
  onlinePaymentAvailable: boolean,
): number {
  if (!settings.depositEnabled || !onlinePaymentAvailable || totalCents <= 0) return 0;
  const amount =
    settings.depositType === "percent"
      ? Math.round((totalCents * settings.depositValue) / 100)
      : Math.min(settings.depositValue, totalCents);
  return Math.max(0, Math.min(amount, totalCents));
}
