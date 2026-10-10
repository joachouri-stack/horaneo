/**
 * Ce dont les abonnements ont besoin chez Stripe Billing (compte de la plateforme).
 * Implémentation réelle : `src/lib/payments/stripe-billing.ts` ; les tests utilisent une fausse.
 */

export type BillingSubscription = {
  id: string;
  customerId: string;
  status: string;
  /** Prix en cours et pack correspondant (renseigné dans les informations du prix). */
  priceId: string | null;
  planId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  /** Pack programmé à la fin de la période (changement vers un pack inférieur). */
  scheduleId: string | null;
  /** Options facturées : une ligne de l'abonnement par option (renseignée dans les informations du prix). */
  optionItems: { itemId: string; optionId: string }[];
  metadata: Record<string, string>;
};

export interface BillingGateway {
  createProduct(input: { name: string; metadata: Record<string, string> }): Promise<{ id: string }>;
  createPrice(input: {
    productId: string;
    amountCents: number;
    currency: string;
    interval: "month" | "year";
    taxInclusive: boolean;
    metadata: Record<string, string>;
  }): Promise<{ id: string }>;
  createTaxRate(input: { percent: number; inclusive: boolean; name: string }): Promise<{ id: string }>;
  createCustomer(input: { email: string | null; name: string; metadata: Record<string, string> }): Promise<{
    id: string;
  }>;
  createCheckout(input: {
    customerId: string;
    priceId: string;
    /** Prix mensuels des options choisies, facturés avec le pack (une ligne chacun). */
    optionPriceIds: string[];
    setupFee: { amountCents: number; currency: string; label: string } | null;
    taxRateId: string | null;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  /** Paiement unique sur la page Stripe (ex. pack de SMS), avec la carte du professionnel. */
  createPaymentCheckout(input: {
    customerId: string;
    amountCents: number;
    currency: string;
    label: string;
    taxRateId: string | null;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ id: string; url: string }>;
  /** État d'une page de paiement (retour du professionnel après le paiement). */
  retrieveCheckout(checkoutId: string): Promise<{
    status: "open" | "complete" | "expired";
    /** Paiement unique : « paid » une fois l'argent reçu. */
    paymentStatus: "paid" | "unpaid" | "no_payment_required";
    subscriptionId: string | null;
    customerId: string | null;
    metadata: Record<string, string>;
  }>;
  retrieveSubscription(subscriptionId: string): Promise<BillingSubscription>;
  /** Fin immédiate (commande refusée). */
  cancelNow(subscriptionId: string): Promise<BillingSubscription>;
  /** Pack supérieur : changement immédiat, différence facturée au prorata tout de suite. */
  changePriceNow(input: { subscriptionId: string; priceId: string }): Promise<BillingSubscription>;
  /** Nouveau prix du même pack : facturé à partir de la prochaine échéance, sans prorata. */
  repriceAtRenewal(input: { subscriptionId: string; priceId: string }): Promise<BillingSubscription>;
  /** Pack inférieur : appliqué à la fin de la période en cours. */
  schedulePriceChange(input: { subscriptionId: string; priceId: string }): Promise<{ scheduleId: string }>;
  releaseSchedule(scheduleId: string): Promise<void>;
  /** Ajoute une option à l'abonnement (facturée au prorata jusqu'à la prochaine échéance). */
  addOptionItem(input: { subscriptionId: string; priceId: string }): Promise<BillingSubscription>;
  /** Retire une option de l'abonnement (crédit au prorata sur la prochaine facture). */
  removeOptionItem(input: { subscriptionId: string; itemId: string }): Promise<BillingSubscription>;
  /** Fin programmée de l'abonnement (null : annule la fin programmée). */
  setCancelAt(input: { subscriptionId: string; at: Date | null }): Promise<BillingSubscription>;
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}
