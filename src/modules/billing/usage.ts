import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { plans, quotaUsage, tenants, type PlanLimits } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { nextResetDate } from "@/modules/messages/sms-usage";
import { getPlatformSetting } from "@/modules/settings";
import { currentPeriod } from "@/modules/tenants/queries";
import { tenantLimits } from "./entitlements";

/**
 * Quotas mensuels (outils intelligents : conversations du chatbot, assistant
 * WhatsApp, textes et images générés…), vérifiés côté serveur :
 * - la limite vient du pack et des options (0 ou absente : non inclus) ;
 * - le compteur repart à zéro chaque mois (période AAAA-MM du site) ;
 * - alerte à la gérante au seuil réglé (sms_warning_percent), puis à 100 % ;
 * - à la limite, l'action est refusée : jamais de facturation automatique,
 *   seules des recharges achetées volontairement (« extra ») ajoutent du crédit.
 * Les SMS gardent leur propre suivi (sms-usage.ts), sur le même principe.
 */

export const METERED_KEYS = ["aiChatConversations", "whatsappConversations", "aiTexts", "aiImages"] as const;
export type MeteredKey = (typeof METERED_KEYS)[number];

/** Seuil d'alerte franchi par cette consommation (en %), ou null. */
export function crossedLevel(before: number, after: number, allowed: number, warningPercent: number) {
  if (allowed <= 0) return null;
  const percent = (value: number) => (value / allowed) * 100;
  if (percent(after) >= 100 && percent(before) < 100) return 100;
  if (percent(after) >= warningPercent && percent(before) < warningPercent) return warningPercent;
  return null;
}

async function limitOf(tx: Transaction, tenantId: string, key: MeteredKey) {
  const [row] = await tx
    .select({ limits: tenantLimits, timezone: tenants.timezone })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  const limit = (row.limits as PlanLimits)[key];
  return { limit: limit === undefined ? 0 : limit, timezone: row.timezone };
}

/** Consommation du mois : utilisé, compris dans le pack, recharges, restant (null : illimité). */
export async function quotaStatus(tx: Transaction, tenantId: string, key: MeteredKey, now = new Date()) {
  const { limit, timezone } = await limitOf(tx, tenantId, key);
  const period = currentPeriod(timezone, now);
  const [row] = await tx
    .select()
    .from(quotaUsage)
    .where(and(eq(quotaUsage.tenantId, tenantId), eq(quotaUsage.period, period), eq(quotaUsage.key, key)));
  const used = row?.used ?? 0;
  const extra = row?.extra ?? 0;
  return {
    period,
    used,
    included: limit,
    extra,
    remaining: limit === null ? null : Math.max(0, limit + extra - used),
    resetsOn: nextResetDate(period),
  };
}

/**
 * Consomme `amount` unités d'un quota (à appeler dans la transaction de
 * l'action). Refusée (« quota_reached ») si le crédit du mois ne suffit pas.
 */
export async function consumeQuota(
  tx: Transaction,
  tenantId: string,
  key: MeteredKey,
  amount = 1,
  now = new Date(),
) {
  const status = await quotaStatus(tx, tenantId, key, now);
  if (status.included === 0 && status.extra === 0) throw new AppError("feature_unavailable", key);
  if (status.remaining !== null && status.remaining < amount) throw new AppError("quota_reached", key);
  const [row] = await tx
    .insert(quotaUsage)
    .values({ tenantId, period: status.period, key, used: amount })
    .onConflictDoUpdate({
      target: [quotaUsage.tenantId, quotaUsage.period, quotaUsage.key],
      set: { used: sql`${quotaUsage.used} + ${amount}` },
    })
    .returning();
  if (status.included !== null) {
    const allowed = status.included + row.extra;
    const level = crossedLevel(
      row.used - amount,
      row.used,
      allowed,
      Number(await getPlatformSetting(tx, "sms_warning_percent")),
    );
    if (level !== null) {
      await queueMessage(tx, {
        tenantId,
        businessId: null,
        template: "manager.usage_quota",
        data: { key, level, used: row.used, limit: allowed, resetsOn: status.resetsOn },
        dedupeKey: `manager.usage_quota:${tenantId}:${status.period}:${key}:${level >= 100 ? 100 : "warning"}`,
      });
    }
  }
  return {
    ...status,
    used: row.used,
    remaining: status.remaining === null ? null : status.remaining - amount,
  };
}

/** Recharge achetée volontairement : crédit ajouté pour le mois en cours. */
export async function addQuotaCredit(
  tx: Transaction,
  tenantId: string,
  key: MeteredKey,
  amount: number,
  now = new Date(),
) {
  if (!Number.isInteger(amount) || amount <= 0) throw new AppError("invalid", "amount");
  const { timezone } = await limitOf(tx, tenantId, key);
  const period = currentPeriod(timezone, now);
  await tx
    .insert(quotaUsage)
    .values({ tenantId, period, key, extra: amount })
    .onConflictDoUpdate({
      target: [quotaUsage.tenantId, quotaUsage.period, quotaUsage.key],
      set: { extra: sql`${quotaUsage.extra} + ${amount}` },
    });
  return quotaStatus(tx, tenantId, key, now);
}
