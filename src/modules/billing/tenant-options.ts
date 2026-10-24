import { and, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { planOptions, tenantOptions } from "@/db/schema";
import { AppError } from "@/modules/errors";
import type { BillingGateway } from "./gateway";
import { dependenciesOf, dependentsOf } from "./option-total";
import { ensureOptionPrice, listPlanOptions, listTenantOptions, pricedOption } from "./options";
import { applySubscription, getSubscription, isLive } from "./subscriptions";

/**
 * Active ou coupe une option pour un site (espace admin, rôle plateforme).
 * - Abonnement Stripe en cours : l'option devient une ligne de l'abonnement
 *   (facturée au prorata), puis les options du site suivent Stripe.
 * - Sans abonnement (site offert, essai) : activée à la main, sans facturation.
 * Les dépendances doivent être actives avant (ex. réservation avant paiement en
 * ligne), et une option dont une autre dépend ne peut pas être coupée seule.
 */
export async function setTenantOption(
  tx: Transaction,
  tenantId: string,
  input: { code: string; active: boolean },
  gateway: BillingGateway | null,
) {
  const [option] = await tx.select().from(planOptions).where(eq(planOptions.code, input.code));
  if (!option) throw new AppError("not_found");
  const catalog = (await listPlanOptions(tx, { all: true })).map((item) => ({
    ...pricedOption(item),
    // Côté admin, une option sans tarif peut être offerte (activation à la main).
    priceCents: item.priceCents ?? 0,
    orderable: true,
  }));
  const current = await listTenantOptions(tx, tenantId);
  const active = current.map((row) => row.option.code);
  if (input.active === active.includes(option.code)) return { changed: false };
  if (input.active) {
    const missing = dependenciesOf(option.code, catalog).filter((code) => !active.includes(code));
    if (missing.length > 0) throw new AppError("option_requires", missing[0]);
  } else {
    const dependents = dependentsOf(option.code, active, catalog);
    if (dependents.length > 0) throw new AppError("option_required_by", dependents[0]);
  }

  const subscription = await getSubscription(tx, tenantId);
  const live = subscription?.stripeSubscriptionId && isLive(subscription.status) ? subscription : null;
  if (!live) {
    if (input.active) await tx.insert(tenantOptions).values({ tenantId, optionId: option.id });
    else
      await tx
        .delete(tenantOptions)
        .where(and(eq(tenantOptions.tenantId, tenantId), eq(tenantOptions.optionId, option.id)));
    return { changed: true, billed: false };
  }

  if (!gateway) throw new AppError("payments_unavailable");
  const subscriptionId = live.stripeSubscriptionId!;
  try {
    let remote;
    if (input.active) {
      if (option.priceCents === null || option.priceCents <= 0) throw new AppError("option_price_missing");
      remote = await gateway.addOptionItem({
        subscriptionId,
        priceId: await ensureOptionPrice(tx, option.id, gateway),
      });
    } else {
      const itemId = current.find((row) => row.option.id === option.id)?.stripeSubscriptionItemId;
      // Option activée à la main avant l'abonnement : rien à retirer chez Stripe.
      if (!itemId) {
        await tx
          .delete(tenantOptions)
          .where(and(eq(tenantOptions.tenantId, tenantId), eq(tenantOptions.optionId, option.id)));
        return { changed: true, billed: false };
      }
      remote = await gateway.removeOptionItem({ subscriptionId, itemId });
    }
    await applySubscription(tx, remote);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("[options]", error);
    throw new AppError("payment_provider_error");
  }
  return { changed: true, billed: true };
}
