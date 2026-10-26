"use server";

import { z } from "zod";
import { withTenant } from "@/db/access";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { paymentGateway } from "@/lib/payments/stripe";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import { loadBookingContext } from "@/modules/booking/availability";
import { AppError, type AppErrorCode } from "@/modules/errors";
import { purchaseInput, startGiftCardPurchase, syncGiftCardPayment } from "@/modules/giftcards/giftcards";

/** Achat d'une carte cadeau sur le site public (sans compte), pour une entreprise du site. */

export type GiftResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorCode; field?: string };

async function run<T>(fn: () => Promise<T>): Promise<GiftResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code, field: error.field };
    if (error instanceof z.ZodError)
      return { ok: false, error: "invalid", field: String(error.issues[0]?.path.join(".") ?? "") };
    throw error;
  }
}

const businessId = z.uuid();

export type GiftCheckout = {
  giftCardId: string;
  amountCents: number;
  currency: string;
  payment: { clientSecret: string; accountId: string; publishableKey: string };
};

export async function buyGiftCardAction(
  business: string,
  raw: z.input<typeof purchaseInput>,
): Promise<GiftResult<GiftCheckout>> {
  return run(async () => {
    const site = await currentSiteTenant();
    if (!publicLimits.booking.attempt(site.ip)) throw new AppError("rate_limited");
    return withTenant(
      site.tenantId,
      async (tx) => {
        // Langue du site : celle de la carte et du reçu envoyés par e-mail.
        const locale = (await loadBookingContext(tx, site.tenantId)).tenant.defaultLocale;
        return startGiftCardPurchase(tx, site.tenantId, { ...raw, locale }, paymentGateway());
      },
      undefined,
      businessId.parse(business),
    );
  });
}

/** Après le paiement dans le navigateur : la carte est activée (et envoyée) dès que Stripe confirme. */
export async function confirmGiftCardAction(
  business: string,
  giftCardId: string,
): Promise<GiftResult<{ active: boolean; sendAt: string }>> {
  return run(async () => {
    const site = await currentSiteTenant();
    if (!publicLimits.manage.attempt(site.ip)) throw new AppError("rate_limited");
    const card = await withTenant(
      site.tenantId,
      (tx) => syncGiftCardPayment(tx, site.tenantId, z.uuid().parse(giftCardId), paymentGateway()),
      undefined,
      businessId.parse(business),
    );
    sendQueuedSoon();
    return { active: card.status === "active", sendAt: card.sendAt.toISOString() };
  });
}
