import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeGateway } from "@/lib/payments/stripe";
import { statementDescriptor } from "@/modules/payments/gateway";
import { connectState } from "@/modules/payments/connect";
import { onlinePaymentReady } from "@/modules/payments/deposits";
import { createFakeGateway } from "./setup/fake-gateway";

describe("libellé sur le relevé bancaire", () => {
  it("garde le nom de l'établissement en caractères acceptés par les banques", () => {
    expect(statementDescriptor("Institut Beauté d'Élise")).toBe("INSTITUT BEAUTE DELISE");
    expect(statementDescriptor("Spa *Zen* <Paris>")).toBe("SPA ZEN PARIS");
    expect(statementDescriptor("Un nom vraiment très très long pour un relevé")).toHaveLength(22);
    expect(statementDescriptor("Léa")).toBeNull();
    expect(statementDescriptor("12345")).toBeNull();
  });
});

describe("état du paiement en ligne", () => {
  const fake = createFakeGateway();
  it("exige le pack, un compte Stripe qui encaisse et les clés configurées", () => {
    const ready = { stripeAccountId: "acct_1", stripeChargesEnabled: true };
    expect(onlinePaymentReady(ready, { onlinePayment: true }, fake.gateway)).toBe(true);
    expect(onlinePaymentReady(ready, { onlinePayment: true }, null)).toBe(false);
    expect(onlinePaymentReady(ready, { onlinePayment: false }, fake.gateway)).toBe(false);
    expect(
      onlinePaymentReady({ ...ready, stripeChargesEnabled: false }, { onlinePayment: true }, fake.gateway),
    ).toBe(false);
    expect(
      connectState({ stripeAccountId: null, stripeChargesEnabled: false }, { onlinePayment: true }),
    ).toBe("not_started");
    expect(
      connectState({ stripeAccountId: "acct_1", stripeChargesEnabled: false }, { onlinePayment: true }),
    ).toBe("incomplete");
    expect(connectState(ready, { onlinePayment: false })).toBe("unavailable");
  });
});

describe("événements Stripe : signature", () => {
  const secret = "whsec_test_secret";
  const gateway = createStripeGateway({
    secretKey: "sk_test_x",
    publishableKey: "pk_test_x",
    webhookSecret: secret,
  });
  const payload = JSON.stringify({
    id: "evt_1",
    object: "event",
    type: "payment_intent.succeeded",
    account: "acct_123",
    data: { object: { id: "pi_1", object: "payment_intent", status: "succeeded" } },
  });

  it("accepte un événement correctement signé", () => {
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const event = gateway.parseEvent(payload, header);
    expect(event).toMatchObject({ id: "evt_1", type: "payment_intent.succeeded", account: "acct_123" });
    expect(event.object).toMatchObject({ id: "pi_1", status: "succeeded" });
  });

  it("refuse une signature fausse ou un contenu modifié", () => {
    const wrong = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_autre" });
    expect(() => gateway.parseEvent(payload, wrong)).toThrow();
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => gateway.parseEvent(payload.replace("pi_1", "pi_2"), header)).toThrow();
  });
});
