import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { messageLog, products, productVariants, shopOrderItems, shopOrders } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { renderMessage } from "@/modules/messages/render";
import { refreshAccount, startOnboarding } from "@/modules/payments/connect";
import { handleEvent } from "@/modules/payments/webhooks";
import { priceCart } from "@/modules/shop/catalog";
import { saveProduct, saveVariant } from "@/modules/shop/products";
import { updateShopSettings } from "@/modules/shop/settings";
import {
  cancelShopOrder,
  expireShopHolds,
  markOrderCollected,
  markOrderReady,
  listShopOrders,
  orderReference,
  startShopCheckout,
  syncShopOrderPayment,
} from "@/modules/shop/orders";
import { createTenant } from "@/modules/tenants/create";
import { createFakeGateway } from "../setup/fake-gateway";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Boutique : commande, réservation du stock, paiement Stripe (simulé), messages. */
describe.skipIf(!hasTestDatabase)("boutique : commandes et paiement", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const fake = createFakeGateway();
  const NOW = new Date("2026-11-04T10:00:00Z");
  const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>, businessId?: string) =>
    withPlatform(fn, app, businessId);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  /** Boutique Pro avec Stripe prêt : un sérum (2 en stock) et une bougie (stock non suivi). */
  async function setup(planCode = "pro") {
    n += 1;
    const slug = `orders-${n}-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, { name: `Boutique ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    const site = <T>(fn: (tx: Transaction) => Promise<T>) => withTenant(id, fn, app, business.id);
    if (planCode !== "starter") {
      const started = await platform((tx) =>
        startOnboarding(tx, id, business.id, fake.gateway, {
          returnUrl: "https://x",
          refreshUrl: "https://x",
        }),
      );
      fake.activate(started.accountId);
      await platform((tx) => refreshAccount(tx, id, business.id, fake.gateway));
    }
    const serum = await platform(
      (tx) => saveProduct(tx, id, { name: "Sérum", price: "29,90", stock: "2" }),
      business.id,
    ).catch(() => null);
    const candle = await platform(
      (tx) => saveProduct(tx, id, { name: "Bougie", price: "19" }),
      business.id,
    ).catch(() => null);
    return { id, businessId: business.id, site, serum, candle };
  }

  const customer = {
    customerName: "Camille Martin",
    customerEmail: "Camille@Example.com",
    customerPhone: "06 12 34 56 78",
    acceptTerms: true,
  };

  const stockOf = async (productId: string) =>
    (await owner.select().from(products).where(eq(products.id, productId)))[0].stockQuantity;

  it("pack sans boutique ou conditions non acceptées : refusé", async () => {
    const starter = await setup("starter");
    expect(
      await errorCode(
        starter.site((tx) =>
          startShopCheckout(tx, starter.id, { ...customer, items: [] }, fake.gateway, NOW),
        ),
      ),
    ).not.toBeUndefined();
    const s = await setup();
    expect(
      await errorCode(
        s.site((tx) =>
          startShopCheckout(
            tx,
            s.id,
            { ...customer, acceptTerms: false, items: [{ productId: s.candle!.id, quantity: 1 }] },
            fake.gateway,
            NOW,
          ),
        ),
      ),
    ).toBe("terms_required");
  });

  it("commande : stock réservé, paiement confirmé, messages à la cliente et à la gérante", async () => {
    const s = await setup();
    const checkout = await s.site((tx) =>
      startShopCheckout(
        tx,
        s.id,
        {
          ...customer,
          items: [
            { productId: s.serum!.id, quantity: 2 },
            { productId: s.candle!.id, quantity: 1 },
          ],
        },
        fake.gateway,
        NOW,
      ),
    );
    expect(checkout.amountCents).toBe(2 * 2990 + 1900);
    expect(await stockOf(s.serum!.id)).toBe(0);
    const [order] = await owner.select().from(shopOrders).where(eq(shopOrders.id, checkout.orderId));
    expect(order).toMatchObject({ status: "pending_payment", customerEmail: "camille@example.com" });
    expect(fake.intents.get(order.stripePaymentIntentId!)?.metadata.shop_order_id).toBe(order.id);

    // Plus de sérum : une autre commande est refusée.
    expect(
      await errorCode(
        s.site((tx) =>
          startShopCheckout(
            tx,
            s.id,
            { ...customer, items: [{ productId: s.serum!.id, quantity: 1 }] },
            fake.gateway,
            NOW,
          ),
        ),
      ),
    ).toBe("shop_out_of_stock");

    fake.pay(order.stripePaymentIntentId!);
    const paid = await s.site((tx) => syncShopOrderPayment(tx, s.id, order.id, fake.gateway, later(2)));
    expect(paid.status).toBe("paid");
    // Deuxième confirmation (événement Stripe) : rien de plus.
    const event = fake.event("payment_intent.succeeded", order.stripeAccountId, {
      id: order.stripePaymentIntentId,
      status: "succeeded",
      metadata: { shop_order_id: order.id },
    });
    expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
      detail: "already_paid",
    });

    const messages = await owner.select().from(messageLog).where(eq(messageLog.tenantId, s.id));
    // E-mails à la cliente et à la gérante, et notification sur le téléphone de la gérante.
    expect(messages.map((row) => `${row.templateKey}:${row.channel}`).sort()).toEqual([
      "customer.shop_order:email",
      "manager.shop_order:email",
      "manager.shop_order:push",
    ]);
    const confirmation = messages.find((row) => row.templateKey === "customer.shop_order")!;
    const rendered = await platform((tx) =>
      renderMessage(tx, confirmation, {
        appUrl: "https://horaneo.test",
        productName: "Horaneo",
        now: NOW,
      } as never),
    );
    expect(rendered).toMatchObject({ kind: "email", to: ["camille@example.com"] });
    if (rendered.kind === "email") {
      expect(rendered.subject).toContain(orderReference(order.id));
      expect(rendered.text).toContain("2 × Sérum");
    }

    const listed = await s.site((tx) => listShopOrders(tx, s.id));
    expect(listed.map((row) => [row.id, row.items.length])).toEqual([[order.id, 2]]);
  });

  it("paiement non abouti : la commande expire et le stock revient ; payée trop tard sans stock, remboursée", async () => {
    const s = await setup();
    const first = await s.site((tx) =>
      startShopCheckout(
        tx,
        s.id,
        { ...customer, items: [{ productId: s.serum!.id, quantity: 2 }] },
        fake.gateway,
        NOW,
      ),
    );
    expect(await stockOf(s.serum!.id)).toBe(0);
    // 31 minutes plus tard : réservation expirée, stock rendu.
    expect(await s.site((tx) => expireShopHolds(tx, s.id, later(31)))).toBe(1);
    expect(await stockOf(s.serum!.id)).toBe(2);
    // Une autre cliente achète les deux sérums…
    await s.site((tx) =>
      startShopCheckout(
        tx,
        s.id,
        { ...customer, customerEmail: "lea@example.com", items: [{ productId: s.serum!.id, quantity: 2 }] },
        fake.gateway,
        later(32),
      ),
    );
    // …puis la première paie quand même : plus de stock, elle est remboursée.
    const [order] = await owner.select().from(shopOrders).where(eq(shopOrders.id, first.orderId));
    fake.pay(order.stripePaymentIntentId!);
    const after = await s.site((tx) => syncShopOrderPayment(tx, s.id, order.id, fake.gateway, later(33)));
    expect(after.status).toBe("refunded");
    expect(
      [...fake.refunds.values()].some((refund) => refund.paymentIntentId === order.stripePaymentIntentId),
    ).toBe(true);
  });

  it("une entreprise ne voit pas les commandes d'une autre", async () => {
    const s = await setup();
    await s.site((tx) =>
      startShopCheckout(
        tx,
        s.id,
        { ...customer, items: [{ productId: s.candle!.id, quantity: 1 }] },
        fake.gateway,
        NOW,
      ),
    );
    const other = await setup();
    const seen = await withTenant(other.id, (tx) => tx.select().from(shopOrders), app, other.businessId);
    expect(seen).toEqual([]);
  });

  it("suivi par la gérante : prête (e-mail), retirée ; annulation remboursée et remise en stock", async () => {
    const s = await setup();
    const pay = async (quantity: number) => {
      const checkout = await s.site((tx) =>
        startShopCheckout(
          tx,
          s.id,
          { ...customer, items: [{ productId: s.serum!.id, quantity }] },
          fake.gateway,
          NOW,
        ),
      );
      const [order] = await owner.select().from(shopOrders).where(eq(shopOrders.id, checkout.orderId));
      fake.pay(order.stripePaymentIntentId!);
      await s.site((tx) => syncShopOrderPayment(tx, s.id, order.id, fake.gateway, later(1)));
      return order.id;
    };
    const first = await pay(1);
    expect(await s.site((tx) => markOrderReady(tx, s.id, first))).toEqual({ status: "ready" });
    // Pas deux fois « prête ».
    expect(await errorCode(s.site((tx) => markOrderReady(tx, s.id, first)))).toBe(
      "shop_order_not_modifiable",
    );
    expect(await s.site((tx) => markOrderCollected(tx, s.id, first))).toEqual({ status: "collected" });
    const ready = await owner
      .select()
      .from(messageLog)
      .where(eq(messageLog.templateKey, "customer.shop_order_ready"));
    expect(ready.some((row) => (row.data as { orderId?: string }).orderId === first)).toBe(true);

    const second = await pay(1);
    expect(await stockOf(s.serum!.id)).toBe(0);
    expect(await s.site((tx) => cancelShopOrder(tx, s.id, second, fake.gateway))).toEqual({
      status: "refunded",
    });
    expect(await stockOf(s.serum!.id)).toBe(1);
    // Une commande retirée ne s'annule plus.
    expect(await errorCode(s.site((tx) => cancelShopOrder(tx, s.id, first, fake.gateway)))).toBe(
      "shop_order_not_modifiable",
    );
  });

  it("variantes : choix obligatoire, prix et stock de la variante, remis en stock à l'annulation", async () => {
    const s = await setup();
    const shirt = await platform(
      (tx) => saveProduct(tx, s.id, { name: "Tee-shirt", price: "25" }),
      s.businessId,
    );
    const small = await platform(
      (tx) => saveVariant(tx, s.id, shirt.id, { name: "S", stock: "1" }),
      s.businessId,
    );
    const large = await platform(
      (tx) => saveVariant(tx, s.id, shirt.id, { name: "L", price: "27", stock: "5" }),
      s.businessId,
    );
    // Sans variante : l'article est retiré du panier.
    const cart = await s.site((tx) =>
      priceCart(
        tx,
        s.id,
        s.businessId,
        [
          { productId: shirt.id, quantity: 1 },
          { productId: shirt.id, variantId: large.id, quantity: 2 },
        ],
        "fr",
      ),
    );
    expect(cart.removed).toEqual([`${shirt.id}:`]);
    expect(cart.lines.map((line) => [line.name, line.unitPriceCents, line.quantity])).toEqual([
      ["Tee-shirt — L", 2700, 2],
    ]);

    const checkout = await s.site((tx) =>
      startShopCheckout(
        tx,
        s.id,
        {
          ...customer,
          items: [
            { productId: shirt.id, variantId: small.id, quantity: 1 },
            { productId: shirt.id, variantId: large.id, quantity: 2 },
          ],
        },
        fake.gateway,
        NOW,
      ),
    );
    expect(checkout.amountCents).toBe(2500 + 2 * 2700);
    const stock = async (id: string) =>
      (await owner.select().from(productVariants).where(eq(productVariants.id, id)))[0].stockQuantity;
    expect([await stock(small.id), await stock(large.id)]).toEqual([0, 3]);
    const items = await owner
      .select()
      .from(shopOrderItems)
      .where(eq(shopOrderItems.orderId, checkout.orderId));
    expect(items.map((item) => [item.name, item.variantId]).sort()).toEqual(
      [
        ["Tee-shirt — L", large.id],
        ["Tee-shirt — S", small.id],
      ].sort(),
    );
    // Plus de taille S : refusé.
    expect(
      await errorCode(
        s.site((tx) =>
          startShopCheckout(
            tx,
            s.id,
            { ...customer, items: [{ productId: shirt.id, variantId: small.id, quantity: 1 }] },
            fake.gateway,
            NOW,
          ),
        ),
      ),
    ).toBe("shop_out_of_stock");
    // Payée puis annulée : les variantes reviennent en stock.
    const [order] = await owner.select().from(shopOrders).where(eq(shopOrders.id, checkout.orderId));
    fake.pay(order.stripePaymentIntentId!);
    await s.site((tx) => syncShopOrderPayment(tx, s.id, order.id, fake.gateway, later(1)));
    await s.site((tx) => cancelShopOrder(tx, s.id, order.id, fake.gateway));
    expect([await stock(small.id), await stock(large.id)]).toEqual([1, 5]);
  });

  it("livraison : réglages de la gérante, adresse obligatoire, frais offerts dès un montant", async () => {
    const s = await setup();
    const order = (extra: Record<string, unknown>, quantity = 1) =>
      s.site((tx) =>
        startShopCheckout(
          tx,
          s.id,
          { ...customer, items: [{ productId: s.candle!.id, quantity }], ...extra },
          fake.gateway,
          NOW,
        ),
      );
    const address = { addressLine1: "3 rue des Lilas", postalCode: "75011", city: "Paris" };
    // Par défaut : retrait sur place seulement.
    expect(await errorCode(order({ fulfillment: "delivery", ...address }))).toBe("invalid");
    // Au moins un mode de remise.
    expect(
      await errorCode(s.site((tx) => updateShopSettings(tx, s.id, { pickup: false, delivery: false }))),
    ).toBe("shop_fulfillment_required");
    await s.site((tx) =>
      updateShopSettings(tx, s.id, {
        pickup: false,
        delivery: true,
        deliveryFee: "4,90",
        freeDeliveryFrom: "50",
      }),
    );
    expect(await errorCode(order({ fulfillment: "pickup" }))).toBe("invalid");
    expect(await errorCode(order({ fulfillment: "delivery", ...address, city: "" }))).toBe("invalid");

    const paying = await order({ fulfillment: "delivery", ...address });
    expect(paying.amountCents).toBe(1900 + 490);
    const [saved] = await owner.select().from(shopOrders).where(eq(shopOrders.id, paying.orderId));
    expect(saved).toMatchObject({
      fulfillment: "delivery",
      deliveryFeeCents: 490,
      deliveryAddressLine1: "3 rue des Lilas",
      deliveryCity: "Paris",
    });
    // Livraison offerte à partir de 50 € d'achat.
    expect((await order({ fulfillment: "delivery", ...address }, 3)).amountCents).toBe(3 * 1900);

    // E-mail « en route » quand la gérante l'expédie.
    fake.pay(saved.stripePaymentIntentId!);
    await s.site((tx) => syncShopOrderPayment(tx, s.id, saved.id, fake.gateway, later(1)));
    await s.site((tx) => markOrderReady(tx, s.id, saved.id));
    const [shipped] = (
      await owner.select().from(messageLog).where(eq(messageLog.templateKey, "customer.shop_order_ready"))
    ).filter((row) => (row.data as { orderId?: string }).orderId === saved.id);
    const rendered = await platform((tx) =>
      renderMessage(tx, shipped, {
        appUrl: "https://horaneo.test",
        productName: "Horaneo",
        now: NOW,
      } as never),
    );
    if (rendered.kind !== "email") throw new Error("e-mail attendu");
    expect(rendered.subject).toContain("en route");
    expect(rendered.text).toContain("3 rue des Lilas");
  });
});
