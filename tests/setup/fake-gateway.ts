import type {
  GatewayAccount,
  GatewayEvent,
  GatewayPaymentIntent,
  GatewayRefund,
  PaymentGateway,
} from "@/modules/payments/gateway";

/**
 * Faux Stripe pour les tests : garde tout en mémoire, sans réseau.
 * Les clés d'idempotence sont respectées comme chez Stripe (même clé = même résultat).
 */
export function createFakeGateway() {
  let counter = 0;
  const next = (prefix: string) => `${prefix}_test_${(counter += 1)}`;
  const accounts = new Map<string, GatewayAccount>();
  const intents = new Map<
    string,
    GatewayPaymentIntent & { accountId: string; applicationFeeCents: number }
  >();
  const refunds = new Map<string, GatewayRefund & { accountId: string }>();
  const idempotency = new Map<string, unknown>();
  const calls: { method: string; input: unknown }[] = [];
  let failNext: string | null = null;

  function maybeFail(method: string) {
    calls.push({ method, input: null });
    if (failNext === method) {
      failNext = null;
      throw new Error(`Stripe indisponible (${method})`);
    }
  }

  const gateway: PaymentGateway = {
    publishableKey: "pk_test_fake",
    async createAccount(input) {
      maybeFail("createAccount");
      const account = { id: next("acct"), chargesEnabled: false, detailsSubmitted: false };
      accounts.set(account.id, account);
      calls.push({ method: "createAccount:input", input });
      return account;
    },
    async retrieveAccount(accountId) {
      maybeFail("retrieveAccount");
      const account = accounts.get(accountId);
      if (!account) throw new Error("Compte inconnu");
      return account;
    },
    async createOnboardingLink(input) {
      maybeFail("createOnboardingLink");
      return `https://connect.stripe.test/setup/${input.accountId}`;
    },
    async createPaymentIntent(input) {
      maybeFail("createPaymentIntent");
      const known = idempotency.get(input.idempotencyKey) as GatewayPaymentIntent | undefined;
      if (known) return known;
      const id = next("pi");
      const intent = {
        id,
        clientSecret: `${id}_secret`,
        status: "requires_payment_method" as const,
        amountCents: input.amountCents,
        currency: input.currency,
        metadata: input.metadata,
        accountId: input.accountId,
        applicationFeeCents: input.applicationFeeCents,
      };
      intents.set(id, intent);
      idempotency.set(input.idempotencyKey, intent);
      return intent;
    },
    async retrievePaymentIntent(accountId, paymentIntentId) {
      maybeFail("retrievePaymentIntent");
      const intent = intents.get(paymentIntentId);
      if (!intent || intent.accountId !== accountId) throw new Error("Paiement inconnu");
      return { ...intent };
    },
    async createRefund(input) {
      maybeFail("createRefund");
      const known = idempotency.get(input.idempotencyKey) as GatewayRefund | undefined;
      if (known) return known;
      const intent = intents.get(input.paymentIntentId);
      if (!intent || intent.status !== "succeeded") throw new Error("Paiement non remboursable");
      const refund = {
        id: next("re"),
        status: "succeeded" as const,
        amountCents: input.amountCents,
        paymentIntentId: input.paymentIntentId,
        metadata: input.metadata,
        accountId: input.accountId,
      };
      refunds.set(refund.id, refund);
      idempotency.set(input.idempotencyKey, refund);
      return refund;
    },
    parseEvent(payload, signature) {
      if (signature !== "valid") throw new Error("Signature invalide");
      const event = JSON.parse(payload) as {
        id: string;
        type: string;
        account?: string;
        data: { object: Record<string, unknown> };
      };
      return {
        id: event.id,
        type: event.type,
        account: event.account ?? null,
        object: event.data.object,
        raw: event,
      } satisfies GatewayEvent;
    },
  };

  return {
    gateway,
    accounts,
    intents,
    refunds,
    calls,
    /** Simule la fin des étapes guidées : le compte peut encaisser. */
    activate(accountId: string) {
      accounts.set(accountId, { id: accountId, chargesEnabled: true, detailsSubmitted: true });
    },
    /** Simule le paiement par la cliente. */
    pay(paymentIntentId: string) {
      const intent = intents.get(paymentIntentId);
      if (!intent) throw new Error("Paiement inconnu");
      intent.status = "succeeded";
      return intent;
    },
    failNext(method: string) {
      failNext = method;
    },
    event(type: string, account: string | null, object: Record<string, unknown>): GatewayEvent {
      const id = next("evt");
      return { id, type, account, object, raw: { id, type, account, data: { object } } };
    },
  };
}

export type FakeGateway = ReturnType<typeof createFakeGateway>;
