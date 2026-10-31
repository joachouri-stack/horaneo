import { and, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { promoCodes, tenants, usageCounters } from "@/db/schema";
import { currentPeriod } from "@/modules/tenants/queries";

/**
 * Réservations temporaires (acompte en attente) : le code promo et la réservation
 * du mois sont comptés dès la réservation. Si le paiement n'aboutit pas, ils sont
 * rendus ; si un paiement tardif reprend le rendez-vous, ils sont comptés à nouveau.
 */

export type HoldUsage = { promoCodeId: string | null; createdAt: Date; source: string };

export async function adjustHoldUsage(
  tx: Transaction,
  tenantId: string,
  holds: HoldUsage[],
  direction: "release" | "reclaim",
  now: Date,
) {
  if (holds.length === 0) return;
  const step = direction === "release" ? -1 : 1;

  const promoCounts = new Map<string, number>();
  for (const hold of holds) {
    if (hold.promoCodeId) promoCounts.set(hold.promoCodeId, (promoCounts.get(hold.promoCodeId) ?? 0) + 1);
  }
  for (const [promoCodeId, count] of promoCounts) {
    await tx
      .update(promoCodes)
      // Jamais au-delà du nombre d'utilisations prévu : un paiement tardif reste honoré.
      .set({
        usedCount: sql`least(greatest(${promoCodes.usedCount} + ${step * count}, 0), coalesce(${promoCodes.maxUses}, greatest(${promoCodes.usedCount} + ${step * count}, 0)))`,
      })
      .where(and(eq(promoCodes.tenantId, tenantId), eq(promoCodes.id, promoCodeId)));
  }

  const online = holds.filter((hold) => hold.source === "online");
  if (online.length === 0) return;
  const [tenant] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) return;
  // Chaque réservation est rendue au mois où elle avait été comptée.
  const periodCounts = new Map<string, number>();
  for (const hold of online) {
    const period = currentPeriod(tenant.timezone, hold.createdAt);
    periodCounts.set(period, (periodCounts.get(period) ?? 0) + 1);
  }
  for (const [period, count] of periodCounts) {
    await tx
      .update(usageCounters)
      .set({
        onlineBookings: sql`greatest(${usageCounters.onlineBookings} + ${step * count}, 0)`,
        updatedAt: now,
      })
      .where(and(eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period)));
  }
}

/**
 * Rendez-vous annulé : son code promo est rendu (un code « une fois » ou limité
 * redevient utilisable). La réservation du mois, elle, reste comptée.
 */
export async function releasePromoUse(tx: Transaction, tenantId: string, promoCodeId: string | null) {
  if (!promoCodeId) return;
  await adjustHoldUsage(
    tx,
    tenantId,
    [{ promoCodeId, createdAt: new Date(), source: "cancelled" }],
    "release",
    new Date(),
  );
}
