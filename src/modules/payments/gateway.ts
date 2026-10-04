/**
 * Ce dont les règles de paiement ont besoin chez le prestataire de paiement
 * (Stripe Connect, paiements directs sur le compte du professionnel).
 * L'implémentation réelle est dans `src/lib/payments/stripe.ts` ; les tests en
 * utilisent une fausse, sans appel réseau.
 */

export type GatewayAccount = {
  id: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

export type GatewayPaymentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "canceled"
  | "succeeded";

export type GatewayPaymentIntent = {
  id: string;
  clientSecret: string | null;
  status: GatewayPaymentStatus;
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
};

export type GatewayRefund = {
  id: string;
  status: "pending" | "succeeded" | "failed" | "canceled" | "requires_action";
  amountCents: number;
  paymentIntentId: string | null;
  metadata: Record<string, string>;
};

/** Événement reçu (déjà authentifié par sa signature). */
export type GatewayEvent = {
  id: string;
  type: string;
  /** Compte connecté concerné (absent pour les événements du compte de la plateforme). */
  account: string | null;
  object: Record<string, unknown>;
  raw: unknown;
};

export interface PaymentGateway {
  /** Clé publique utilisée par le formulaire de carte dans le navigateur. */
  readonly publishableKey: string;
  createAccount(input: {
    country: string;
    email: string | null;
    businessName: string;
    statementDescriptor: string | null;
    metadata: Record<string, string>;
  }): Promise<GatewayAccount>;
  retrieveAccount(accountId: string): Promise<GatewayAccount>;
  createOnboardingLink(input: { accountId: string; returnUrl: string; refreshUrl: string }): Promise<string>;
  createPaymentIntent(input: {
    accountId: string;
    amountCents: number;
    currency: string;
    applicationFeeCents: number;
    receiptEmail: string | null;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<GatewayPaymentIntent>;
  retrievePaymentIntent(accountId: string, paymentIntentId: string): Promise<GatewayPaymentIntent>;
  createRefund(input: {
    accountId: string;
    paymentIntentId: string;
    amountCents: number;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<GatewayRefund>;
  /** Vérifie la signature d'un événement ; lève une erreur si elle est fausse. */
  parseEvent(payload: string, signature: string): GatewayEvent;
}

/**
 * Libellé sur le relevé bancaire de la cliente : le nom de l'établissement,
 * ramené aux caractères acceptés par les banques (5 à 22 caractères latins).
 */
export function statementDescriptor(name: string): string | null {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[<>\\'"*]/g, "")
    .replace(/[^A-Za-z0-9 .,&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 22)
    .trim();
  return cleaned.length >= 5 && /[A-Z]/.test(cleaned) ? cleaned : null;
}
