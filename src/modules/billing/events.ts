import type { Transaction } from "@/db/client";
import { processEventOnce, type EventOutcome } from "@/modules/payments/webhooks";
import { markOrderPaid } from "@/modules/orders/orders";
import type { BillingGateway, BillingSubscription } from "./gateway";
import { rewardReferral } from "./referrals";
import { confirmSmsPack } from "./sms-packs";
import { applyInvoicePaid, applyPaymentFailed, applySubscription } from "./subscriptions";

/** Événements Stripe Billing, déjà traduits par la route qui les reçoit. */
export type BillingEvent = {
  id: string;
  type: string;
  raw: unknown;
} & (
  | { kind: "subscription"; subscription: BillingSubscription }
  | {
      kind: "checkout_completed";
      subscriptionId: string | null;
      /** Paiement unique (pack de SMS) : identifiant de la page de paiement, état et informations. */
      checkoutId?: string;
      paymentStatus?: string;
      metadata?: Record<string, string>;
    }
  | {
      kind: "invoice_paid";
      subscriptionId: string | null;
      /** Montant réglé (0 : facture de l'essai gratuit). */
      amountPaidCents?: number;
    }
  | {
      kind: "invoice_failed";
      subscriptionId: string | null;
      invoiceId: string;
      attempt: number;
      error: string | null;
    }
  | { kind: "other" }
);

export async function handleBillingEvent(
  tx: Transaction,
  event: BillingEvent,
  gateway: BillingGateway | null,
): Promise<EventOutcome> {
  return processEventOnce(tx, { ...event, account: null }, async () => {
    switch (event.kind) {
      case "subscription": {
        // État relu chez Stripe : un événement ancien renvoyé en retard (après une résiliation)
        // ne doit pas rétablir un pack payant. Sans passerelle (tests), la copie de l'événement.
        const current = gateway
          ? await gateway.retrieveSubscription(event.subscription.id)
          : event.subscription;
        return (await applySubscription(tx, current)).outcome;
      }
      case "checkout_completed": {
        // Pack de SMS : crédité seulement quand l'argent est reçu.
        if (event.metadata?.kind === "sms_pack") {
          if (event.paymentStatus !== "paid" || !event.checkoutId) return "not_paid";
          return (
            await confirmSmsPack(tx, { checkoutId: event.checkoutId, smsPackId: event.metadata.sms_pack_id })
          ).outcome;
        }
        // L'abonnement créé par le paiement est relu chez Stripe (état complet et à jour).
        if (!event.subscriptionId || !gateway) return "no_subscription";
        const subscription = await gateway.retrieveSubscription(event.subscriptionId);
        const applied = await applySubscription(tx, subscription);
        // Paiement d'une commande du site commercial : le site n'existe pas encore.
        if (applied.outcome === "unknown_tenant" && subscription.metadata.order_id) {
          return (
            await markOrderPaid(tx, {
              orderId: subscription.metadata.order_id,
              subscriptionId: subscription.id,
              customerId: subscription.customerId,
            })
          ).outcome;
        }
        return applied.outcome;
      }
      case "invoice_paid": {
        if (!event.subscriptionId) return null;
        const paid = await applyInvoicePaid(tx, { subscriptionId: event.subscriptionId });
        // Premier vrai paiement d'une nouvelle cliente parrainée : mois offerts à la marraine.
        const referral = await rewardReferral(
          tx,
          { subscriptionId: event.subscriptionId, amountPaidCents: event.amountPaidCents ?? 0 },
          gateway,
        );
        return referral?.outcome ?? paid.outcome;
      }
      case "invoice_failed": {
        if (!event.subscriptionId) return null;
        // Échec ancien reçu après un paiement réussi : l'abonnement est relu, rien à signaler s'il est à jour.
        if (gateway) {
          const current = await gateway.retrieveSubscription(event.subscriptionId);
          if (current.status === "active" || current.status === "trialing") return "already_paid";
        }
        return (
          await applyPaymentFailed(tx, {
            subscriptionId: event.subscriptionId,
            invoiceId: event.invoiceId,
            attempt: event.attempt,
            error: event.error,
          })
        ).outcome;
      }
      default:
        return null;
    }
  });
}
