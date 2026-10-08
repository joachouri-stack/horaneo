import { and, desc, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { plans, smsPacks, tenants, type PlanLimits } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { getPlatformSetting } from "@/modules/settings";
import type { BillingGateway } from "./gateway";
import { ensureCustomer, ensureTaxRate } from "./subscriptions";

/**
 * Packs de SMS supplémentaires (rôle plateforme) : achetés par la gérante de
 * l'entreprise principale, payés sur la page Stripe avec sa carte, crédités
 * seulement une fois le paiement confirmé par Stripe. Taille et prix : réglages.
 */

/** Offre en cours : nombre de SMS et prix, lus dans les réglages. */
export async function smsPackOffer(tx: Transaction) {
  return {
    size: Number(await getPlatformSetting(tx, "sms_pack_size")),
    priceCents: Number(await getPlatformSetting(tx, "sms_pack_price_cents")),
  };
}

/** Packs achetés (payés ou épuisés), les plus récents d'abord. */
export async function listSmsPacks(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(smsPacks)
    .where(and(eq(smsPacks.tenantId, tenantId), sql`${smsPacks.status} <> 'pending_payment'`))
    .orderBy(desc(smsPacks.paidAt));
}

/** Seuls les packs qui comprennent des SMS peuvent en ajouter (pas le Basic). */
export async function canBuySmsPacks(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ limits: plans.limits })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  const limit = (row?.limits as PlanLimits | undefined)?.smsPerMonth;
  return limit === null || (limit !== undefined && limit > 0);
}

/** Prépare l'achat d'un pack et renvoie l'adresse de la page de paiement Stripe. */
export async function startSmsPackPurchase(
  tx: Transaction,
  tenantId: string,
  input: { userId: string | null; successUrl: string; cancelUrl: string },
  gateway: BillingGateway | null,
) {
  if (!gateway) throw new AppError("payments_unavailable");
  if (!(await canBuySmsPacks(tx, tenantId))) throw new AppError("feature_unavailable", "smsPacks");
  const offer = await smsPackOffer(tx);
  if (offer.size <= 0 || offer.priceCents <= 0) throw new AppError("feature_unavailable", "smsPacks");
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  const customer = await ensureCustomer(tx, tenantId, gateway);
  const [pack] = await tx
    .insert(smsPacks)
    .values({
      tenantId,
      quantity: offer.size,
      remaining: offer.size,
      priceCents: offer.priceCents,
      purchasedByUserId: input.userId,
    })
    .returning();
  const t = await getTranslator(resolveLocale(tenant.defaultLocale));
  const checkout = await gateway
    .createPaymentCheckout({
      customerId: customer.stripeCustomerId!,
      amountCents: offer.priceCents,
      currency: pack.currency,
      label: t("billing.smsPackLabel", { count: offer.size }),
      taxRateId: await ensureTaxRate(tx, gateway),
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      metadata: { kind: "sms_pack", tenant_id: tenantId, sms_pack_id: pack.id },
    })
    .catch((error: unknown) => {
      console.error("[sms]", error);
      throw new AppError("payment_provider_error");
    });
  await tx.update(smsPacks).set({ stripeCheckoutSessionId: checkout.id }).where(eq(smsPacks.id, pack.id));
  return checkout.url;
}

/**
 * Paiement confirmé par Stripe : le pack est crédité, une seule fois (événement
 * reçu deux fois, ou retour de la gérante sur son espace).
 */
export async function confirmSmsPack(
  tx: Transaction,
  input: { checkoutId: string; smsPackId: string | undefined },
  now = new Date(),
) {
  if (!input.smsPackId || !/^[0-9a-f-]{36}$/i.test(input.smsPackId))
    return { outcome: "unknown_pack" as const };
  const credited = await tx
    .update(smsPacks)
    .set({ status: "paid", paidAt: now, updatedAt: now })
    .where(
      and(
        eq(smsPacks.id, input.smsPackId),
        eq(smsPacks.stripeCheckoutSessionId, input.checkoutId),
        eq(smsPacks.status, "pending_payment"),
      ),
    )
    .returning({ id: smsPacks.id });
  return { outcome: credited.length > 0 ? ("credited" as const) : ("already_credited" as const) };
}

/** Retour de la gérante après le paiement : l'état est relu chez Stripe (sans attendre l'événement). */
export async function syncSmsPackPayment(
  tx: Transaction,
  tenantId: string,
  checkoutId: string,
  gateway: BillingGateway | null,
) {
  if (!gateway || !/^cs_[A-Za-z0-9_]+$/.test(checkoutId)) return null;
  const [pack] = await tx
    .select()
    .from(smsPacks)
    .where(and(eq(smsPacks.tenantId, tenantId), eq(smsPacks.stripeCheckoutSessionId, checkoutId)));
  if (!pack || pack.status !== "pending_payment") return pack ?? null;
  const checkout = await gateway.retrieveCheckout(checkoutId).catch(() => null);
  if (checkout?.paymentStatus === "paid") {
    await confirmSmsPack(tx, { checkoutId, smsPackId: pack.id });
  }
  return pack;
}
