import type { BillingGateway, BillingSubscription } from "@/modules/billing/gateway";

/**
 * Faux Stripe Billing pour les tests : abonnements en mémoire, avec de quoi
 * simuler la fin d'une période, un paiement Checkout ou un impayé.
 */
export function createFakeBilling() {
  const instance = Math.random().toString(36).slice(2, 8);
  let counter = 0;
  const next = (prefix: string) => `${prefix}_${instance}_${(counter += 1)}`;
  const prices = new Map<
    string,
    { productId: string; amountCents: number; metadata: Record<string, string> }
  >();
  const subscriptions = new Map<string, BillingSubscription & { pendingPriceId: string | null }>();
  const checkouts = new Map<
    string,
    {
      customerId: string;
      priceId: string;
      setupFee: unknown;
      taxRateId: string | null;
      metadata: Record<string, string>;
      subscriptionId?: string;
    }
  >();
  const taxRates: { id: string; percent: number; inclusive: boolean }[] = [];
  const calls: string[] = [];

  const planOfPrice = (priceId: string) =>
    prices.get(priceId)?.metadata.plan_id ?? /^price_([0-9a-f-]{36})_/.exec(priceId)?.[1] ?? null;

  const snapshot = (id: string): BillingSubscription => {
    const sub = subscriptions.get(id);
    if (!sub) throw new Error("Abonnement inconnu");
    const { pendingPriceId, ...rest } = sub;
    void pendingPriceId;
    return { ...rest, metadata: { ...rest.metadata } };
  };

  const gateway: BillingGateway = {
    async createProduct() {
      calls.push("createProduct");
      return { id: next("prod") };
    },
    async createPrice(input) {
      calls.push("createPrice");
      // Le pack est inscrit dans l'identifiant : un autre fichier de test (autre faux Stripe)
      // peut réutiliser un prix enregistré dans la base partagée.
      const id = next(`price_${input.metadata.plan_id ?? "x"}`);
      prices.set(id, {
        productId: input.productId,
        amountCents: input.amountCents,
        metadata: input.metadata,
      });
      return { id };
    },
    async createTaxRate(input) {
      const rate = { id: next("txr"), percent: input.percent, inclusive: input.inclusive };
      taxRates.push(rate);
      return { id: rate.id };
    },
    async createCustomer() {
      calls.push("createCustomer");
      return { id: next("cus") };
    },
    async createCheckout(input) {
      const id = next("cs");
      checkouts.set(id, { ...input });
      return { id, url: `https://checkout.stripe.test/${id}` };
    },
    async retrieveSubscription(id) {
      return snapshot(id);
    },
    async retrieveCheckout(id) {
      const checkout = checkouts.get(id);
      if (!checkout) throw new Error("Paiement inconnu");
      return {
        status: checkout.subscriptionId ? "complete" : "open",
        subscriptionId: checkout.subscriptionId ?? null,
        customerId: checkout.customerId,
      };
    },
    async cancelNow(id) {
      calls.push("cancelNow");
      subscriptions.get(id)!.status = "canceled";
      return snapshot(id);
    },
    async changePriceNow({ subscriptionId, priceId }) {
      calls.push("changePriceNow");
      const sub = subscriptions.get(subscriptionId)!;
      sub.priceId = priceId;
      sub.planId = planOfPrice(priceId);
      return snapshot(subscriptionId);
    },
    async schedulePriceChange({ subscriptionId, priceId }) {
      calls.push("schedulePriceChange");
      const sub = subscriptions.get(subscriptionId)!;
      sub.pendingPriceId = priceId;
      sub.scheduleId = sub.scheduleId ?? next("sub_sched");
      return { scheduleId: sub.scheduleId };
    },
    async releaseSchedule(scheduleId) {
      calls.push("releaseSchedule");
      for (const sub of subscriptions.values()) {
        if (sub.scheduleId === scheduleId) {
          sub.scheduleId = null;
          sub.pendingPriceId = null;
        }
      }
    },
    async setCancelAt({ subscriptionId, at }) {
      calls.push(at ? "setCancelAt" : "clearCancelAt");
      const sub = subscriptions.get(subscriptionId)!;
      if (sub.scheduleId) throw new Error("Abonnement lié à un calendrier : libérer d'abord");
      sub.cancelAt = at;
      return snapshot(subscriptionId);
    },
    async createPortal({ customerId }) {
      return { url: `https://billing.stripe.test/portal/${customerId}` };
    },
  };

  return {
    gateway,
    prices,
    subscriptions,
    checkouts,
    taxRates,
    calls,
    /** La gérante paie sur la page Stripe : l'abonnement est créé. */
    completeCheckout(checkoutId: string, start: Date) {
      const checkout = checkouts.get(checkoutId)!;
      const id = next("sub");
      checkout.subscriptionId = id;
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      subscriptions.set(id, {
        id,
        customerId: checkout.customerId,
        status: "active",
        priceId: checkout.priceId,
        planId: planOfPrice(checkout.priceId),
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAt: null,
        scheduleId: null,
        metadata: { ...checkout.metadata },
        pendingPriceId: null,
      });
      return snapshot(id);
    },
    /** Fin de la période : le pack programmé s'applique, ou l'abonnement se termine. */
    renew(subscriptionId: string) {
      const sub = subscriptions.get(subscriptionId)!;
      if (sub.cancelAt && sub.currentPeriodEnd && sub.cancelAt <= sub.currentPeriodEnd) {
        sub.status = "canceled";
        return snapshot(subscriptionId);
      }
      if (sub.pendingPriceId) {
        sub.priceId = sub.pendingPriceId;
        sub.planId = planOfPrice(sub.pendingPriceId);
        sub.pendingPriceId = null;
        sub.scheduleId = null;
      }
      sub.currentPeriodStart = sub.currentPeriodEnd;
      const end = new Date(sub.currentPeriodEnd!);
      end.setUTCMonth(end.getUTCMonth() + 1);
      sub.currentPeriodEnd = end;
      return snapshot(subscriptionId);
    },
    setStatus(subscriptionId: string, status: string) {
      subscriptions.get(subscriptionId)!.status = status;
      return snapshot(subscriptionId);
    },
    pendingPriceOf(subscriptionId: string) {
      return subscriptions.get(subscriptionId)!.pendingPriceId;
    },
  };
}

export type FakeBilling = ReturnType<typeof createFakeBilling>;
