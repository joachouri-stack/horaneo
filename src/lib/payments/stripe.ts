import "server-only";
import Stripe from "stripe";
import { env } from "@/config/env";
import type {
  GatewayAccount,
  GatewayPaymentIntent,
  GatewayRefund,
  PaymentGateway,
} from "@/modules/payments/gateway";

/**
 * Passerelle Stripe Connect (comptes « Standard », paiements directs) :
 * l'acompte est encaissé directement sur le compte Stripe du professionnel.
 * Le SaaS ne détient jamais les fonds.
 */

function toAccount(account: Stripe.Account): GatewayAccount {
  return {
    id: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
  };
}

function toPaymentIntent(intent: Stripe.PaymentIntent): GatewayPaymentIntent {
  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status as GatewayPaymentIntent["status"],
    amountCents: intent.amount,
    currency: intent.currency.toUpperCase(),
    metadata: { ...intent.metadata },
  };
}

function toRefund(refund: Stripe.Refund): GatewayRefund {
  const intent = refund.payment_intent;
  return {
    id: refund.id,
    status: (refund.status ?? "pending") as GatewayRefund["status"],
    amountCents: refund.amount,
    paymentIntentId: typeof intent === "string" ? intent : (intent?.id ?? null),
    metadata: { ...(refund.metadata ?? {}) },
  };
}

export function createStripeGateway(config: {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}): PaymentGateway {
  const stripe = new Stripe(config.secretKey, { maxNetworkRetries: 2, timeout: 20_000 });

  return {
    publishableKey: config.publishableKey,

    async createAccount(input) {
      const account = await stripe.accounts.create({
        // Équivalent d'un compte « Standard » : tableau de bord Stripe complet,
        // frais et litiges à la charge du compte, informations collectées par Stripe.
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
        country: input.country,
        email: input.email ?? undefined,
        business_profile: { name: input.businessName },
        settings: input.statementDescriptor
          ? { payments: { statement_descriptor: input.statementDescriptor } }
          : undefined,
        metadata: input.metadata,
      });
      return toAccount(account);
    },

    async retrieveAccount(accountId) {
      return toAccount(await stripe.accounts.retrieve(accountId));
    },

    async createOnboardingLink(input) {
      const link = await stripe.accountLinks.create({
        account: input.accountId,
        type: "account_onboarding",
        return_url: input.returnUrl,
        refresh_url: input.refreshUrl,
      });
      return link.url;
    },

    async createPaymentIntent(input) {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          // Carte uniquement (Apple Pay et Google Pay compris) : paiement immédiat,
          // compatible avec la réservation du créneau pendant 10 minutes.
          allowed_payment_method_types: ["card"],
          application_fee_amount: input.applicationFeeCents > 0 ? input.applicationFeeCents : undefined,
          receipt_email: input.receiptEmail ?? undefined,
          metadata: input.metadata,
        },
        { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
      );
      return toPaymentIntent(intent);
    },

    async retrievePaymentIntent(accountId, paymentIntentId) {
      return toPaymentIntent(
        await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: accountId }),
      );
    },

    async createRefund(input) {
      const refund = await stripe.refunds.create(
        { payment_intent: input.paymentIntentId, amount: input.amountCents, metadata: input.metadata },
        { stripeAccount: input.accountId, idempotencyKey: input.idempotencyKey },
      );
      return toRefund(refund);
    },

    parseEvent(payload, signature) {
      const event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
      return {
        id: event.id,
        type: event.type,
        account: event.account ?? null,
        object: event.data.object as unknown as Record<string, unknown>,
        raw: event,
      };
    },
  };
}

let override: PaymentGateway | null | undefined;
let cached: PaymentGateway | null | undefined;

/** Passerelle configurée, ou null si les clés Stripe ne sont pas renseignées. */
export function paymentGateway(): PaymentGateway | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const { STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_CONNECT_WEBHOOK_SECRET } = env();
  cached =
    STRIPE_SECRET_KEY && STRIPE_PUBLISHABLE_KEY && STRIPE_CONNECT_WEBHOOK_SECRET
      ? createStripeGateway({
          secretKey: STRIPE_SECRET_KEY,
          publishableKey: STRIPE_PUBLISHABLE_KEY,
          webhookSecret: STRIPE_CONNECT_WEBHOOK_SECRET,
        })
      : null;
  return cached;
}

/** Tests uniquement : remplace la passerelle (undefined pour revenir à la configuration). */
export function setPaymentGatewayForTests(gateway: PaymentGateway | null | undefined) {
  override = gateway;
}
