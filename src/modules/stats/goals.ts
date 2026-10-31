import { and, eq } from "drizzle-orm";
import { assertFeature } from "@/modules/quotas";
import { z } from "zod";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { parseMoney } from "@/modules/money";

/**
 * Objectifs du mois de la gérante (chiffre d'affaires, rendez-vous, nouvelles
 * clientes), affichés en progression dans ses statistiques. Un champ vide
 * retire l'objectif.
 */

const optionalCount = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .pipe(z.number().int().min(1).max(100_000).nullable());

export const statsGoalsInput = z.object({
  /** En euros (« 3000 », « 2 500,50 »). */
  revenue: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : parseMoney(value)))
    .pipe(z.number().int().min(100).max(1_000_000_000).nullable()),
  appointments: optionalCount,
  newCustomers: optionalCount,
});

export type StatsGoals = {
  revenueCents: number | null;
  appointments: number | null;
  newCustomers: number | null;
};

async function targetBusiness(tx: Transaction, businessId?: string) {
  const id = businessId ?? (await currentBusinessId(tx));
  if (!id) throw new AppError("not_found");
  return id;
}

export async function getStatsGoals(
  tx: Transaction,
  tenantId: string,
  businessId?: string,
): Promise<StatsGoals> {
  const id = await targetBusiness(tx, businessId);
  const [row] = await tx
    .select({
      revenueCents: businessSettings.revenueGoalCents,
      appointments: businessSettings.appointmentsGoal,
      newCustomers: businessSettings.newCustomersGoal,
    })
    .from(businessSettings)
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)));
  if (!row) throw new AppError("not_found");
  return row;
}

export async function updateStatsGoals(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof statsGoalsInput>,
  businessId?: string,
) {
  // Objectifs du mois : avec les statistiques détaillées du pack seulement.
  await assertFeature(tx, tenantId, "stats");
  const parsed = statsGoalsInput.safeParse(raw);
  if (!parsed.success) throw new AppError("invalid", String(parsed.error.issues[0]?.path[0] ?? ""));
  const id = await targetBusiness(tx, businessId);
  const [updated] = await tx
    .update(businessSettings)
    .set({
      revenueGoalCents: parsed.data.revenue,
      appointmentsGoal: parsed.data.appointments,
      newCustomersGoal: parsed.data.newCustomers,
    })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)))
    .returning({ businessId: businessSettings.businessId });
  if (!updated) throw new AppError("not_found");
  return updated;
}
