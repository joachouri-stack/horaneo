import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { SHOP } from "@/config/shop";
import type { Transaction } from "@/db/client";
import { products, productVariants, shopOrderItems, shopOrders } from "@/db/schema";
import type { Locale } from "@/i18n/locales";
import { loadBookingContext } from "@/modules/booking/availability";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import type { GatewayPaymentIntent, PaymentGateway } from "@/modules/payments/gateway";
import { onlinePaymentReady, providerError } from "@/modules/payments/deposits";
import { normalizePhone } from "@/modules/phone";
import { cartInput, priceCart } from "./catalog";

/**
 * Commandes de la boutique (retrait sur place), payées en ligne sur le compte Stripe de
 * l'entreprise. Le stock est réservé à la commande pendant quelques minutes : si le paiement
 * n'aboutit pas, il est rendu ; un paiement qui arrive après, sans stock, est remboursé.
 */

export type ShopOrderRow = typeof shopOrders.$inferSelect;

/** Référence courte d'une commande, lisible au téléphone ou au comptoir (« 4F2A9C »). */
export function orderReference(orderId: string): string {
  return orderId.replace(/-/g, "").slice(-6).toUpperCase();
}

export const checkoutInput = z.object({
  items: cartInput,
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  customerPhone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
  acceptTerms: z.boolean().refine((value) => value, "terms"),
  locale: z.string().min(2).max(5).default("fr"),
});

/** Remet en stock les articles suivis d'une commande (variante, ou produit). */
async function restock(tx: Transaction, orderId: string) {
  const items = await tx.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, orderId));
  for (const item of items) {
    if (!item.stockTracked || !item.productId) continue;
    if (item.variantId) {
      await tx
        .update(productVariants)
        .set({ stockQuantity: sql`${productVariants.stockQuantity} + ${item.quantity}` })
        .where(
          and(eq(productVariants.id, item.variantId), sql`${productVariants.stockQuantity} IS NOT NULL`),
        );
      continue;
    }
    await tx
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} + ${item.quantity}` })
      .where(and(eq(products.id, item.productId), sql`${products.stockQuantity} IS NOT NULL`));
  }
}

/**
 * Réserve le stock des articles suivis (tout ou rien) : faux s'il en manque.
 * Le stock ne passe jamais sous zéro, même avec deux commandes en même temps.
 */
async function reserve(
  tx: Transaction,
  items: { productId: string | null; variantId: string | null; quantity: number; stockTracked: boolean }[],
) {
  for (const item of items) {
    if (!item.stockTracked || !item.productId) continue;
    if (item.variantId) {
      const [variant] = await tx
        .update(productVariants)
        .set({ stockQuantity: sql`${productVariants.stockQuantity} - ${item.quantity}` })
        .where(
          and(
            eq(productVariants.id, item.variantId),
            sql`${productVariants.stockQuantity} >= ${item.quantity}`,
          ),
        )
        .returning({ id: productVariants.id });
      if (!variant) return false;
      continue;
    }
    const [updated] = await tx
      .update(products)
      .set({ stockQuantity: sql`${products.stockQuantity} - ${item.quantity}` })
      .where(and(eq(products.id, item.productId), sql`${products.stockQuantity} >= ${item.quantity}`))
      .returning({ id: products.id });
    if (!updated) return false;
  }
  return true;
}

/** Commandes non payées à temps : expirées, stock rendu (entreprise déclarée). */
export async function expireShopHolds(tx: Transaction, tenantId: string, now: Date) {
  const stale = await tx
    .select({ id: shopOrders.id })
    .from(shopOrders)
    .where(
      and(
        eq(shopOrders.tenantId, tenantId),
        eq(shopOrders.status, "pending_payment"),
        lt(shopOrders.holdExpiresAt, now),
      ),
    )
    .for("update", { skipLocked: true });
  for (const order of stale) {
    await tx.update(shopOrders).set({ status: "expired" }).where(eq(shopOrders.id, order.id));
    await restock(tx, order.id);
  }
  return stale.length;
}

/**
 * Commande : panier relu en base, stock réservé, commande « en attente de paiement »
 * et paiement créé sur le compte Stripe de l'entreprise (déclarée dans la transaction).
 */
export async function startShopCheckout(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof checkoutInput>,
  gateway: PaymentGateway | null,
  now = new Date(),
) {
  const parsed = checkoutInput.safeParse(raw);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    throw new AppError(field === "acceptTerms" ? "terms_required" : "invalid", field);
  }
  const input = parsed.data;
  const context = await loadBookingContext(tx, tenantId);
  if (!context.features.commerce || !onlinePaymentReady(context.business, context.features, gateway))
    throw new AppError("shop_unavailable");
  const phone = normalizePhone(input.customerPhone, context.tenant.country, "customerPhone");
  await expireShopHolds(tx, tenantId, now);
  const cart = await priceCart(tx, tenantId, context.business.id, input.items, input.locale as Locale);
  if (!cart.ready || cart.removed.length > 0 || !cart.currency) throw new AppError("shop_out_of_stock");

  const items = cart.lines.map((line) => ({
    productId: line.product.id,
    variantId: line.variant?.id ?? null,
    name: line.name,
    unitPriceCents: line.unitPriceCents,
    quantity: line.quantity,
    stockTracked: line.available !== null,
  }));
  if (!(await reserve(tx, items))) throw new AppError("shop_out_of_stock");

  const [order] = await tx
    .insert(shopOrders)
    .values({
      tenantId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: phone,
      note: input.note || null,
      totalCents: cart.totalCents,
      currency: cart.currency,
      locale: input.locale,
      holdExpiresAt: new Date(now.getTime() + SHOP.holdMinutes * 60_000),
      stripeAccountId: context.business.stripeAccountId,
    })
    .returning();
  await tx.insert(shopOrderItems).values(items.map((item) => ({ ...item, tenantId, orderId: order.id })));

  const intent = await gateway
    .createPaymentIntent({
      accountId: context.business.stripeAccountId!,
      amountCents: order.totalCents,
      currency: order.currency,
      applicationFeeCents: 0,
      receiptEmail: order.customerEmail,
      metadata: { tenant_id: tenantId, business_id: context.business.id, shop_order_id: order.id },
      idempotencyKey: `shop-order-${order.id}`,
    })
    .catch(providerError);
  if (!intent.clientSecret) throw new AppError("payment_provider_error");
  await tx.update(shopOrders).set({ stripePaymentIntentId: intent.id }).where(eq(shopOrders.id, order.id));
  return {
    orderId: order.id,
    reference: orderReference(order.id),
    amountCents: order.totalCents,
    currency: order.currency,
    holdExpiresAt: order.holdExpiresAt!.toISOString(),
    payment: {
      clientSecret: intent.clientSecret,
      accountId: context.business.stripeAccountId!,
      publishableKey: gateway.publishableKey,
    },
  };
}

/**
 * Paiement confirmé (retour du navigateur ou événement Stripe) : la commande est payée et
 * les messages partent. Arrivé après l'expiration, sans stock : remboursé automatiquement.
 * Sans effet si c'est déjà fait (l'appeler deux fois ne compte jamais deux fois).
 */
export async function applyShopOrderIntent(
  tx: Transaction,
  tenantId: string,
  intent: Pick<GatewayPaymentIntent, "id" | "status">,
  gateway: PaymentGateway | null,
  now = new Date(),
) {
  const [order] = await tx
    .select()
    .from(shopOrders)
    .where(and(eq(shopOrders.tenantId, tenantId), eq(shopOrders.stripePaymentIntentId, intent.id)))
    .for("update");
  if (!order) return { outcome: "unknown_order" as const };
  if (intent.status !== "succeeded") return { outcome: "pending" as const, orderId: order.id };
  if (order.status !== "pending_payment" && order.status !== "expired")
    return { outcome: "already_paid" as const, orderId: order.id };
  if (order.status === "expired") {
    // Paiement tardif : le stock est repris s'il en reste, sinon la cliente est remboursée.
    const items = await tx.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id));
    if (!(await reserve(tx, items))) {
      if (!gateway || !order.stripeAccountId) throw new AppError("payment_provider_error");
      const refund = await gateway
        .createRefund({
          accountId: order.stripeAccountId,
          paymentIntentId: intent.id,
          amountCents: order.totalCents,
          metadata: { shop_order_id: order.id, reason: "out_of_stock" },
          idempotencyKey: `shop-order-refund-${order.id}`,
        })
        .catch(providerError);
      await tx
        .update(shopOrders)
        .set({ status: "refunded", stripeRefundId: refund.id, paidAt: now })
        .where(eq(shopOrders.id, order.id));
      await queueMessage(tx, {
        tenantId,
        businessId: order.businessId,
        template: "customer.shop_order",
        locale: order.locale,
        data: { orderId: order.id },
        dedupeKey: `customer.shop_order:${order.id}`,
      });
      return { outcome: "refunded" as const, orderId: order.id };
    }
  }
  await tx
    .update(shopOrders)
    .set({ status: "paid", paidAt: now, holdExpiresAt: null })
    .where(eq(shopOrders.id, order.id));
  const data = { orderId: order.id };
  await queueMessage(tx, {
    tenantId,
    businessId: order.businessId,
    template: "customer.shop_order",
    locale: order.locale,
    data,
    dedupeKey: `customer.shop_order:${order.id}`,
  });
  await queueMessage(tx, {
    tenantId,
    businessId: order.businessId,
    template: "manager.shop_order",
    data,
    dedupeKey: `manager.shop_order:${order.id}`,
  });
  return { outcome: "paid" as const, orderId: order.id };
}

/** Après le paiement dans le navigateur : relit le paiement chez Stripe. */
export async function syncShopOrderPayment(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  gateway: PaymentGateway | null,
  now = new Date(),
) {
  const [order] = await tx
    .select()
    .from(shopOrders)
    .where(and(eq(shopOrders.tenantId, tenantId), eq(shopOrders.id, orderId)));
  if (!order) throw new AppError("not_found");
  if (
    (order.status === "pending_payment" || order.status === "expired") &&
    gateway &&
    order.stripePaymentIntentId &&
    order.stripeAccountId
  ) {
    const intent = await gateway
      .retrievePaymentIntent(order.stripeAccountId, order.stripePaymentIntentId)
      .catch(providerError);
    await applyShopOrderIntent(tx, tenantId, intent, gateway, now);
  }
  const [after] = await tx.select().from(shopOrders).where(eq(shopOrders.id, orderId));
  return after;
}

/** Commande et ses articles (entreprise déclarée). */
export async function loadShopOrder(tx: Transaction, tenantId: string, orderId: string) {
  const [order] = await tx
    .select()
    .from(shopOrders)
    .where(and(eq(shopOrders.tenantId, tenantId), eq(shopOrders.id, orderId)));
  if (!order) return null;
  const items = await tx
    .select()
    .from(shopOrderItems)
    .where(eq(shopOrderItems.orderId, order.id))
    .orderBy(asc(shopOrderItems.createdAt));
  return { order, items };
}

/** Commandes de l'entreprise déclarée (les plus récentes d'abord), hors paiements non aboutis. */
export async function listShopOrders(tx: Transaction, tenantId: string, limit = 200) {
  const orders = await tx
    .select()
    .from(shopOrders)
    .where(
      and(
        eq(shopOrders.tenantId, tenantId),
        inArray(shopOrders.status, ["paid", "ready", "collected", "cancelled", "refunded"]),
      ),
    )
    .orderBy(desc(shopOrders.createdAt))
    .limit(limit);
  const items = orders.length
    ? await tx
        .select()
        .from(shopOrderItems)
        .where(
          inArray(
            shopOrderItems.orderId,
            orders.map((order) => order.id),
          ),
        )
    : [];
  return orders.map((order) => ({ ...order, items: items.filter((item) => item.orderId === order.id) }));
}

// ─── Suivi par la gérante ─────────────────────────────────────────────────────

async function lockOrder(tx: Transaction, tenantId: string, orderId: string) {
  const [order] = await tx
    .select()
    .from(shopOrders)
    .where(and(eq(shopOrders.tenantId, tenantId), eq(shopOrders.id, orderId)))
    .for("update");
  if (!order) throw new AppError("not_found");
  return order;
}

/** Commande prête : la cliente reçoit un e-mail pour venir la retirer. */
export async function markOrderReady(tx: Transaction, tenantId: string, orderId: string, now = new Date()) {
  const order = await lockOrder(tx, tenantId, orderId);
  if (order.status !== "paid") throw new AppError("shop_order_not_modifiable");
  await tx.update(shopOrders).set({ status: "ready", readyAt: now }).where(eq(shopOrders.id, order.id));
  await queueMessage(tx, {
    tenantId,
    businessId: order.businessId,
    template: "customer.shop_order_ready",
    locale: order.locale,
    data: { orderId: order.id },
    dedupeKey: `customer.shop_order_ready:${order.id}`,
  });
  return { status: "ready" as const };
}

/** Commande retirée par la cliente. */
export async function markOrderCollected(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  now = new Date(),
) {
  const order = await lockOrder(tx, tenantId, orderId);
  if (order.status !== "paid" && order.status !== "ready") throw new AppError("shop_order_not_modifiable");
  await tx
    .update(shopOrders)
    .set({ status: "collected", collectedAt: now })
    .where(eq(shopOrders.id, order.id));
  return { status: "collected" as const };
}

/**
 * Annulation par la gérante (produit manquant, cliente qui ne vient pas…) : la cliente est
 * remboursée intégralement et le stock revient en vente.
 */
export async function cancelShopOrder(
  tx: Transaction,
  tenantId: string,
  orderId: string,
  gateway: PaymentGateway | null,
  now = new Date(),
) {
  const order = await lockOrder(tx, tenantId, orderId);
  if (order.status !== "paid" && order.status !== "ready") throw new AppError("shop_order_not_modifiable");
  if (!gateway || !order.stripeAccountId || !order.stripePaymentIntentId)
    throw new AppError("payments_unavailable");
  const refund = await gateway
    .createRefund({
      accountId: order.stripeAccountId,
      paymentIntentId: order.stripePaymentIntentId,
      amountCents: order.totalCents,
      metadata: { shop_order_id: order.id, reason: "cancelled_by_business" },
      idempotencyKey: `shop-order-refund-${order.id}`,
    })
    .catch(providerError);
  await tx
    .update(shopOrders)
    .set({ status: "refunded", stripeRefundId: refund.id, cancelledAt: now })
    .where(eq(shopOrders.id, order.id));
  await restock(tx, order.id);
  await queueMessage(tx, {
    tenantId,
    businessId: order.businessId,
    template: "customer.shop_order_cancelled",
    locale: order.locale,
    data: { orderId: order.id },
    dedupeKey: `customer.shop_order_cancelled:${order.id}`,
  });
  return { status: "refunded" as const };
}
