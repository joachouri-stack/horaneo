import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { plans, smsPacks, tenants, usageCounters, type PlanLimits } from "@/db/schema";
import { getPlatformSetting } from "@/modules/settings";
import { currentPeriod } from "@/modules/tenants/queries";
import { queueMessage } from "./queue";

/**
 * SMS d'un site : le quota du mois du pack d'abord, puis les packs achetés
 * (les plus anciens d'abord). Le quota repart à zéro chaque mois ; les SMS
 * non utilisés ne sont pas reportés. Un message long compte pour chacun de
 * ses SMS. Rien n'est jamais acheté automatiquement : sans quota ni pack, le
 * SMS n'est pas envoyé (le rappel par e-mail part de son côté).
 */

export type SmsReservation = {
  period: string;
  fromQuota: number;
  fromPacks: { id: string; count: number }[];
};

/** Premier jour du mois suivant (date de remise à zéro du quota), au format AAAA-MM-JJ. */
export function nextResetDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

async function tenantPlan(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ timezone: tenants.timezone, limits: plans.limits })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  return row ? { timezone: row.timezone, limit: (row.limits as PlanLimits).smsPerMonth } : null;
}

/** SMS encore disponibles dans les packs achetés. */
export async function packsRemaining(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${smsPacks.remaining}), 0)::int` })
    .from(smsPacks)
    .where(and(eq(smsPacks.tenantId, tenantId), eq(smsPacks.status, "paid")));
  return row?.total ?? 0;
}

/** Utilisation du mois, pour l'espace gérante et l'admin. */
export async function smsUsage(tx: Transaction, tenantId: string, now = new Date()) {
  const plan = await tenantPlan(tx, tenantId);
  if (!plan) return null;
  const period = currentPeriod(plan.timezone, now);
  const [counter] = await tx
    .select({ sent: usageCounters.smsSent, fromPacks: usageCounters.smsFromPacks })
    .from(usageCounters)
    .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period)));
  const used = counter?.sent ?? 0;
  const limit = plan.limit ?? null;
  return {
    period,
    /** SMS pris sur le quota du mois. */
    used,
    /** null : sans limite. */
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    fromPacks: counter?.fromPacks ?? 0,
    packsRemaining: await packsRemaining(tx, tenantId),
    resetsOn: nextResetDate(period),
  };
}

/**
 * Réserve les SMS d'un message, de façon atomique (rôle plateforme) : quota du
 * mois, puis packs achetés. null si le pack n'inclut pas de SMS, ou si le quota
 * et les packs ne suffisent pas (rien n'est alors décompté).
 */
export async function reserveSms(
  tx: Transaction,
  tenantId: string,
  now: Date,
  segments = 1,
): Promise<SmsReservation | null> {
  const plan = await tenantPlan(tx, tenantId);
  if (!plan) return null;
  const limit = plan.limit;
  // Pack sans SMS (Basic) : ni quota, ni packs achetés utilisables.
  if (limit !== null && limit !== undefined && limit <= 0) return null;
  const period = currentPeriod(plan.timezone, now);
  await tx.insert(usageCounters).values({ tenantId, period }).onConflictDoNothing();
  const [counter] = await tx
    .select({ sent: usageCounters.smsSent })
    .from(usageCounters)
    .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period)))
    .for("update");
  const before = counter.sent;
  const fromQuota =
    limit === null || limit === undefined ? segments : Math.max(0, Math.min(segments, limit - before));
  let missing = segments - fromQuota;
  const fromPacks: SmsReservation["fromPacks"] = [];
  if (missing > 0) {
    const packs = await tx
      .select({ id: smsPacks.id, remaining: smsPacks.remaining })
      .from(smsPacks)
      .where(and(eq(smsPacks.tenantId, tenantId), eq(smsPacks.status, "paid"), gt(smsPacks.remaining, 0)))
      .orderBy(asc(smsPacks.paidAt), asc(smsPacks.id))
      .for("update");
    if (packs.reduce((sum, pack) => sum + pack.remaining, 0) < missing) {
      await queueQuotaAlert(tx, tenantId, period, 100, before, limit!);
      return null;
    }
    for (const pack of packs) {
      if (missing === 0) break;
      const count = Math.min(pack.remaining, missing);
      await tx
        .update(smsPacks)
        .set({ remaining: sql`${smsPacks.remaining} - ${count}`, updatedAt: now })
        .where(eq(smsPacks.id, pack.id));
      fromPacks.push({ id: pack.id, count });
      missing -= count;
    }
  }
  const packCount = segments - fromQuota;
  await tx
    .update(usageCounters)
    .set({
      smsSent: sql`${usageCounters.smsSent} + ${fromQuota}`,
      smsFromPacks: sql`${usageCounters.smsFromPacks} + ${packCount}`,
      updatedAt: now,
    })
    .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period)));

  if (limit !== null && limit !== undefined) {
    const after = before + fromQuota;
    const percent = Number(await getPlatformSetting(tx, "sms_warning_percent"));
    const warnAt = Math.ceil((limit * percent) / 100);
    if (after >= limit && before < limit) await queueQuotaAlert(tx, tenantId, period, 100, after, limit);
    else if (after >= warnAt && before < warnAt)
      await queueQuotaAlert(tx, tenantId, period, percent, after, limit);
  }
  return { period, fromQuota, fromPacks };
}

/** Envoi échoué : les SMS réservés sont rendus (quota du mois et packs). */
export async function releaseSms(tx: Transaction, tenantId: string, reservation: SmsReservation) {
  const packCount = reservation.fromPacks.reduce((sum, pack) => sum + pack.count, 0);
  await tx
    .update(usageCounters)
    .set({
      smsSent: sql`greatest(${usageCounters.smsSent} - ${reservation.fromQuota}, 0)`,
      smsFromPacks: sql`greatest(${usageCounters.smsFromPacks} - ${packCount}, 0)`,
    })
    .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, reservation.period)));
  for (const pack of reservation.fromPacks) {
    await tx
      .update(smsPacks)
      .set({ remaining: sql`least(${smsPacks.remaining} + ${pack.count}, ${smsPacks.quantity})` })
      .where(eq(smsPacks.id, pack.id));
  }
}

/** Alerte à la gérante (e-mail et espace), une seule fois par mois et par seuil. */
async function queueQuotaAlert(
  tx: Transaction,
  tenantId: string,
  period: string,
  level: number,
  used: number,
  limit: number,
) {
  await queueMessage(tx, {
    tenantId,
    businessId: null,
    template: "manager.sms_quota",
    data: { level, used, limit, period, resetsOn: nextResetDate(period) },
    dedupeKey: `manager.sms_quota:${tenantId}:${period}:${level >= 100 ? 100 : "warning"}`,
  });
}

/** Fin de l'abonnement payant : les SMS achetés non utilisés ne sont plus disponibles. */
export async function expireSmsPacks(tx: Transaction, tenantId: string, now = new Date()) {
  await tx
    .update(smsPacks)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(smsPacks.tenantId, tenantId), inArray(smsPacks.status, ["paid"])));
}
