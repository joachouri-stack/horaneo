import { eq, isNotNull } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { plans, subscriptions, tenants } from "@/db/schema";
import { queueMessage } from "@/modules/messages/queue";
import { getPlatformSetting } from "@/modules/settings";
import type { BillingGateway } from "./gateway";
import { ensurePlanPrice, isLive } from "./subscriptions";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Nouveau prix d'un pack et abonnés en cours (tâche planifiée) : chacun garde
 * son prix jusqu'à la fin de son engagement ; il est prévenu
 * `price_change_notice_days` jours avant, puis le nouveau prix s'applique à
 * l'échéance suivante (sans prorata). Sans engagement : préavis, puis nouveau prix.
 * Rejouable : chaque étape est notée sur l'abonnement.
 */
export async function applyPriceChanges(tx: Transaction, gateway: BillingGateway | null, now = new Date()) {
  const result = { scheduled: 0, notified: 0, applied: 0, cleared: 0, failed: 0 };
  if (!gateway) return result;
  const notice = Number(await getPlatformSetting(tx, "price_change_notice_days"));
  const rows = await tx
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(isNotNull(subscriptions.stripeSubscriptionId));

  const step = async (sub: typeof subscriptions.$inferSelect, plan: typeof plans.$inferSelect) => {
    // Abonnement terminé, fin programmée ou changement de pack en attente : rien à faire ici.
    if (!isLive(sub.status) || sub.cancelAt || sub.scheduledPlanId || plan.priceCents <= 0) return;
    // Prix actuel inconnu (abonnement antérieur à ce suivi) : relu chez Stripe.
    let currentPriceId = sub.stripePriceId;
    if (!currentPriceId) {
      currentPriceId = (await gateway.retrieveSubscription(sub.stripeSubscriptionId!)).priceId;
      if (!currentPriceId) return;
      await tx
        .update(subscriptions)
        .set({ stripePriceId: currentPriceId })
        .where(eq(subscriptions.id, sub.id));
    }
    const planPriceId = await ensurePlanPrice(tx, plan.id, gateway);
    if (currentPriceId === planPriceId) {
      // Prix revenu à l'ancien montant : plus de changement prévu.
      if (sub.priceChangeAt) {
        await tx
          .update(subscriptions)
          .set({ priceChangeAt: null, priceChangeNotifiedAt: null })
          .where(eq(subscriptions.id, sub.id));
        result.cleared += 1;
      }
      return;
    }

    let changeAt = sub.priceChangeAt;
    if (!changeAt) {
      // Fin de l'engagement, et jamais moins que le préavis à partir d'aujourd'hui.
      const earliest = now.getTime() + notice * DAY;
      changeAt = new Date(Math.max(sub.commitmentEndsAt?.getTime() ?? 0, earliest));
      await tx.update(subscriptions).set({ priceChangeAt: changeAt }).where(eq(subscriptions.id, sub.id));
      result.scheduled += 1;
    }

    if (!sub.priceChangeNotifiedAt && now.getTime() >= changeAt.getTime() - notice * DAY) {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, sub.tenantId));
      await queueMessage(tx, {
        tenantId: sub.tenantId,
        template: "manager.price_change",
        locale: tenant?.defaultLocale,
        data: { planId: plan.id, priceCents: plan.priceCents, changeAt: changeAt.toISOString() },
        dedupeKey: `manager.price_change:${sub.id}:${planPriceId}`,
      });
      await tx.update(subscriptions).set({ priceChangeNotifiedAt: now }).where(eq(subscriptions.id, sub.id));
      result.notified += 1;
      return;
    }

    if (sub.priceChangeNotifiedAt && now >= changeAt) {
      const remote = await gateway.repriceAtRenewal({
        subscriptionId: sub.stripeSubscriptionId!,
        priceId: planPriceId,
      });
      await tx
        .update(subscriptions)
        .set({
          stripePriceId: remote.priceId ?? planPriceId,
          priceChangeAt: null,
          priceChangeNotifiedAt: null,
        })
        .where(eq(subscriptions.id, sub.id));
      result.applied += 1;
    }
  };

  for (const { sub, plan } of rows) {
    // Un abonnement en erreur chez Stripe n'empêche pas les autres : il sera repris au passage suivant.
    try {
      await step(sub, plan);
    } catch (error) {
      result.failed += 1;
      console.error("[prix] abonnement", sub.id, error);
    }
  }
  return result;
}
