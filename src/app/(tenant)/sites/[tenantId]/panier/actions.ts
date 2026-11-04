"use server";

import { z } from "zod";
import { withTenant } from "@/db/access";
import { storage } from "@/lib/storage";
import { publicLimits } from "@/lib/site/current";
import { openShop } from "@/lib/site/shop";
import { AppError, type AppErrorCode } from "@/modules/errors";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { paymentGateway } from "@/lib/payments/stripe";
import { cartInput, priceCart } from "@/modules/shop/catalog";
import {
  checkoutInput,
  orderReference,
  startShopCheckout,
  syncShopOrderPayment,
} from "@/modules/shop/orders";
import { productPath } from "@/modules/site/paths";

/** Panier de la boutique : relu en base à chaque affichage (prix, stock, produits encore en vente). */

export type ShopResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorCode; field?: string };

async function run<T>(fn: () => Promise<T>): Promise<ShopResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code, field: error.field };
    if (error instanceof z.ZodError) return { ok: false, error: "invalid" };
    throw error;
  }
}

export type CartView = {
  lines: {
    productId: string;
    name: string;
    href: string;
    photoUrl: string | null;
    priceCents: number;
    quantity: number;
    available: number | null;
    ok: boolean;
    totalCents: number;
  }[];
  removed: string[];
  totalCents: number;
  currency: string | null;
  ready: boolean;
};

export async function viewCartAction(
  business: string,
  items: z.input<typeof cartInput>,
): Promise<ShopResult<CartView>> {
  return run(async () => {
    const { site, businessId, locale } = await openShop(business);
    if (!publicLimits.availability.attempt(site.ip)) throw new AppError("rate_limited");
    const cart = await withTenant(
      site.tenantId,
      (tx) => priceCart(tx, site.tenantId, businessId, items, locale),
      undefined,
      businessId,
    );
    const store = storage();
    return {
      lines: cart.lines.map((line) => ({
        productId: line.product.id,
        name: line.product.name,
        href: productPath(line.product.id),
        photoUrl: line.product.photo ? store.publicUrl(line.product.photo.key) : null,
        priceCents: line.product.priceCents,
        quantity: line.quantity,
        available: line.available,
        ok: line.ok,
        totalCents: line.totalCents,
      })),
      removed: cart.removed,
      totalCents: cart.totalCents,
      currency: cart.currency,
      ready: cart.ready,
    };
  });
}

export type ShopCheckout = {
  orderId: string;
  reference: string;
  amountCents: number;
  currency: string;
  holdExpiresAt: string;
  payment: { clientSecret: string; accountId: string; publishableKey: string };
};

/** Commande : panier relu en base, stock réservé, paiement créé sur le compte de l'entreprise. */
export async function startCheckoutAction(
  business: string,
  raw: Omit<z.input<typeof checkoutInput>, "locale">,
): Promise<ShopResult<ShopCheckout>> {
  return run(async () => {
    const { site, businessId, locale } = await openShop(business);
    if (!publicLimits.booking.attempt(site.ip)) throw new AppError("rate_limited");
    return withTenant(
      site.tenantId,
      (tx) => startShopCheckout(tx, site.tenantId, { ...raw, locale }, paymentGateway()),
      undefined,
      businessId,
    );
  });
}

/** Après le paiement dans le navigateur : la commande est confirmée dès que Stripe confirme. */
export async function confirmOrderAction(
  business: string,
  orderId: string,
): Promise<ShopResult<{ status: string; reference: string }>> {
  return run(async () => {
    const { site, businessId } = await openShop(business);
    if (!publicLimits.manage.attempt(site.ip)) throw new AppError("rate_limited");
    const order = await withTenant(
      site.tenantId,
      (tx) => syncShopOrderPayment(tx, site.tenantId, z.uuid().parse(orderId), paymentGateway()),
      undefined,
      businessId,
    );
    sendQueuedSoon();
    return { status: order.status, reference: orderReference(order.id) };
  });
}
