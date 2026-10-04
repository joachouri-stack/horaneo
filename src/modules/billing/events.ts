import type { Transaction } from "@/db/client";
import { processEventOnce, type EventOutcome } from "@/modules/payments/webhooks";
import type { BillingGateway, BillingSubscription } from "./gateway";
import { applyInvoicePaid, applyPaymentFailed, applySubscription } from "./subscriptions";

/** Événements Stripe Billing, déjà traduits par la route qui les reçoit. */
export type BillingEvent = {
  id: string;
  type: string;
  raw: unknown;
} & (
  | { kind: "subscription"; subscription: BillingSubscription }
  | { kind: "checkout_completed"; subscriptionId: string | null }
  | { kind: "invoice_paid"; subscriptionId: string | null }
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
      case "subscription":
        return (await applySubscription(tx, event.subscription)).outcome;
      case "checkout_completed": {
        // L'abonnement créé par le paiement est relu chez Stripe (état complet et à jour).
        if (!event.subscriptionId || !gateway) return "no_subscription";
        const subscription = await gateway.retrieveSubscription(event.subscriptionId);
        return (await applySubscription(tx, subscription)).outcome;
      }
      case "invoice_paid":
        return event.subscriptionId
          ? (await applyInvoicePaid(tx, { subscriptionId: event.subscriptionId })).outcome
          : null;
      case "invoice_failed":
        return event.subscriptionId
          ? (
              await applyPaymentFailed(tx, {
                subscriptionId: event.subscriptionId,
                invoiceId: event.invoiceId,
                attempt: event.attempt,
                error: event.error,
              })
            ).outcome
          : null;
      default:
        return null;
    }
  });
}
