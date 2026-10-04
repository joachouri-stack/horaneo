import "server-only";
import Stripe from "stripe";
import { env } from "@/config/env";
import type { BillingGateway, BillingSubscription } from "@/modules/billing/gateway";

/**
 * Stripe Billing, sur le compte Stripe de la plateforme : abonnements mensuels
 * des professionnels, changements de pack, portail de gestion de la carte et des factures.
 */

const toDate = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : null);

export function toBillingSubscription(subscription: Stripe.Subscription): BillingSubscription {
  const item = subscription.items.data[0];
  const price = item?.price;
  const schedule = subscription.schedule;
  return {
    id: subscription.id,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    status: subscription.status,
    priceId: price?.id ?? null,
    planId: price?.metadata?.plan_id ?? null,
    currentPeriodStart: toDate(item?.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end),
    cancelAt: toDate(subscription.cancel_at),
    scheduleId: typeof schedule === "string" ? schedule : (schedule?.id ?? null),
    metadata: { ...subscription.metadata },
  };
}

export function createStripeBilling(secretKey: string): BillingGateway {
  const stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });

  return {
    async createProduct(input) {
      const product = await stripe.products.create({ name: input.name, metadata: input.metadata });
      return { id: product.id };
    },

    async createPrice(input) {
      const price = await stripe.prices.create({
        product: input.productId,
        unit_amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        recurring: { interval: input.interval },
        tax_behavior: input.taxInclusive ? "inclusive" : "exclusive",
        metadata: input.metadata,
      });
      return { id: price.id };
    },

    async createTaxRate(input) {
      const rate = await stripe.taxRates.create({
        display_name: input.name,
        percentage: input.percent,
        inclusive: input.inclusive,
      });
      return { id: rate.id };
    },

    async createCustomer(input) {
      const customer = await stripe.customers.create({
        email: input.email ?? undefined,
        name: input.name,
        metadata: input.metadata,
      });
      return { id: customer.id };
    },

    async createCheckout(input) {
      const taxRates = input.taxRateId ? [input.taxRateId] : undefined;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: input.customerId,
        line_items: [
          { price: input.priceId, quantity: 1, tax_rates: taxRates },
          ...(input.setupFee
            ? [
                {
                  quantity: 1,
                  tax_rates: taxRates,
                  price_data: {
                    currency: input.setupFee.currency.toLowerCase(),
                    unit_amount: input.setupFee.amountCents,
                    product_data: { name: input.setupFee.label },
                  },
                },
              ]
            : []),
        ],
        subscription_data: { metadata: input.metadata },
        metadata: input.metadata,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        allow_promotion_codes: false,
      });
      if (!session.url) throw new Error("Stripe n'a pas renvoyé d'adresse de paiement");
      return { id: session.id, url: session.url };
    },

    async retrieveCheckout(checkoutId) {
      const session = await stripe.checkout.sessions.retrieve(checkoutId);
      const sub = session.subscription;
      const customer = session.customer;
      return {
        status: (session.status ?? "open") as "open" | "complete" | "expired",
        subscriptionId: typeof sub === "string" ? sub : (sub?.id ?? null),
        customerId: typeof customer === "string" ? customer : (customer?.id ?? null),
      };
    },

    async cancelNow(subscriptionId) {
      return toBillingSubscription(await stripe.subscriptions.cancel(subscriptionId));
    },

    async retrieveSubscription(subscriptionId) {
      return toBillingSubscription(await stripe.subscriptions.retrieve(subscriptionId));
    },

    async changePriceNow(input) {
      const current = await stripe.subscriptions.retrieve(input.subscriptionId);
      const updated = await stripe.subscriptions.update(input.subscriptionId, {
        items: [{ id: current.items.data[0].id, price: input.priceId }],
        // La différence est facturée tout de suite, au prorata des jours restants.
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
      });
      return toBillingSubscription(updated);
    },

    async schedulePriceChange(input) {
      const current = await stripe.subscriptions.retrieve(input.subscriptionId);
      const existing = current.schedule;
      const schedule = existing
        ? await stripe.subscriptionSchedules.retrieve(typeof existing === "string" ? existing : existing.id)
        : await stripe.subscriptionSchedules.create({ from_subscription: input.subscriptionId });
      const phase = schedule.phases[0];
      const updated = await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: "release",
        phases: [
          {
            items: [{ price: current.items.data[0].price.id, quantity: 1 }],
            start_date: phase.start_date,
            end_date: phase.end_date,
          },
          {
            items: [{ price: input.priceId, quantity: 1 }],
            duration: { interval: "month", interval_count: 1 },
          },
        ],
      });
      return { scheduleId: updated.id };
    },

    async releaseSchedule(scheduleId) {
      await stripe.subscriptionSchedules.release(scheduleId);
    },

    async setCancelAt(input) {
      const updated = await stripe.subscriptions.update(input.subscriptionId, {
        cancel_at: input.at ? Math.floor(input.at.getTime() / 1000) : null,
        proration_behavior: "none",
      });
      return toBillingSubscription(updated);
    },

    async createPortal(input) {
      const session = await stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      });
      return { url: session.url };
    },
  };
}

let override: BillingGateway | null | undefined;
let cached: BillingGateway | null | undefined;

/** Stripe Billing configuré, ou null si la clé secrète n'est pas renseignée. */
export function billingGateway(): BillingGateway | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const key = env().STRIPE_SECRET_KEY;
  cached = key ? createStripeBilling(key) : null;
  return cached;
}

export function setBillingGatewayForTests(gateway: BillingGateway | null | undefined) {
  override = gateway;
}
