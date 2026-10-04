import Stripe from "stripe";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { billingGateway, toBillingSubscription } from "@/lib/payments/stripe-billing";
import { handleBillingEvent, type BillingEvent } from "@/modules/billing/events";
import { recordEventError } from "@/modules/payments/webhooks";

/**
 * Point de réception des événements Stripe Billing (compte de la plateforme) :
 * abonnements, factures payées ou refusées. La signature est vérifiée avant tout.
 */

function invoiceSubscription(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent?.subscription_details?.subscription;
  if (parent) return typeof parent === "string" ? parent : parent.id;
  return null;
}

function translate(event: Stripe.Event): BillingEvent {
  const base = { id: event.id, type: event.type, raw: event };
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return { ...base, kind: "subscription", subscription: toBillingSubscription(event.data.object) };
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscription = session.subscription;
      return {
        ...base,
        kind: "checkout_completed",
        subscriptionId: typeof subscription === "string" ? subscription : (subscription?.id ?? null),
      };
    }
    case "invoice.paid":
      return { ...base, kind: "invoice_paid", subscriptionId: invoiceSubscription(event.data.object) };
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      return {
        ...base,
        kind: "invoice_failed",
        subscriptionId: invoiceSubscription(invoice),
        invoiceId: invoice.id ?? event.id,
        attempt: invoice.attempt_count ?? 1,
        error: invoice.last_finalization_error?.message ?? null,
      };
    }
    default:
      return { ...base, kind: "other" };
  }
}

export async function POST(request: Request) {
  const { STRIPE_SECRET_KEY, STRIPE_BILLING_WEBHOOK_SECRET } = env();
  if (!STRIPE_SECRET_KEY || !STRIPE_BILLING_WEBHOOK_SECRET)
    return new Response("Abonnements non configurés", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Signature absente", { status: 400 });
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, STRIPE_BILLING_WEBHOOK_SECRET);
  } catch {
    return new Response("Signature invalide", { status: 400 });
  }
  const billingEvent = translate(event);
  try {
    const result = await withPlatform((tx) => handleBillingEvent(tx, billingEvent, billingGateway()));
    sendQueuedSoon();
    return Response.json({ received: true, ...result });
  } catch (error) {
    console.error("[stripe] abonnement", event.id, event.type, error);
    await withPlatform((tx) => recordEventError(tx, { ...billingEvent, account: null }, error)).catch(
      () => undefined,
    );
    return new Response("Erreur de traitement", { status: 500 });
  }
}
