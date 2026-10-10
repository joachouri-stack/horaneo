import { tenantFeatures } from "@/modules/billing/entitlements";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  businessSettings,
  customers,
  loyaltyEvents,
  loyaltyRewards,
  plans,
  tenants,
  type PlanFeatures,
} from "@/db/schema";
import { AppError } from "@/modules/errors";

/**
 * Programme de fidélité d'une entreprise : un point par rendez-vous honoré.
 * Quand le nombre de visites fixé est atteint, un bon apparaît (avantage et
 * date de validité figés). Utilisé, il retire ces visites du compteur : les
 * soins faits entre-temps ne sont pas perdus. Expiré, il les retire aussi.
 * Fonctions (tx, tenantId, …) : entreprise déclarée par l'appelant.
 */

const DAY_MS = 86_400_000;

export const loyaltySettingsInput = z
  .object({
    enabled: z.boolean(),
    visitsRequired: z.coerce.number().int().min(2).max(50),
    rewardLabel: z.string().trim().max(120).optional(),
    rewardCents: z.coerce.number().int().min(1).max(100_000).optional(),
    validityDays: z.coerce.number().int().min(7).max(730),
  })
  .refine((input) => !input.enabled || input.rewardLabel || input.rewardCents, {
    path: ["rewardLabel"],
    message: "loyalty_reward_required",
  });

async function businessOf(tx: Transaction, businessId?: string) {
  const id = businessId ?? (await currentBusinessId(tx));
  if (!id) throw new AppError("not_found");
  return id;
}

/** Réglages du programme et accès du pack (fonction « loyalty »). */
export async function loyaltyConfig(tx: Transaction, tenantId: string, businessId?: string) {
  const id = await businessOf(tx, businessId);
  const [row] = await tx
    .select({ settings: businessSettings, features: tenantFeatures })
    .from(businessSettings)
    .innerJoin(tenants, eq(tenants.id, businessSettings.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)));
  if (!row) throw new AppError("not_found");
  const s = row.settings;
  const included = Boolean((row.features as PlanFeatures).loyalty);
  return {
    businessId: id,
    included,
    active: included && s.loyaltyEnabled,
    enabled: s.loyaltyEnabled,
    visitsRequired: s.loyaltyVisitsRequired,
    rewardLabel: s.loyaltyRewardLabel,
    rewardCents: s.loyaltyRewardCents,
    validityDays: s.loyaltyRewardValidityDays,
  };
}

export async function setLoyaltySettings(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof loyaltySettingsInput>,
  businessId?: string,
) {
  const input = loyaltySettingsInput.parse(raw);
  const config = await loyaltyConfig(tx, tenantId, businessId);
  if (!config.included) throw new AppError("feature_unavailable");
  await tx
    .update(businessSettings)
    .set({
      loyaltyEnabled: input.enabled,
      loyaltyVisitsRequired: input.visitsRequired,
      loyaltyRewardLabel: input.rewardLabel || null,
      loyaltyRewardCents: input.rewardCents ?? null,
      loyaltyRewardValidityDays: input.validityDays,
    })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, config.businessId)));
}

async function balanceOf(tx: Transaction, customerIds: string[]) {
  if (customerIds.length === 0) return 0;
  const [row] = await tx
    .select({ points: sql<number>`coalesce(sum(${loyaltyEvents.points}), 0)::int` })
    .from(loyaltyEvents)
    .where(inArray(loyaltyEvents.customerId, customerIds));
  return row?.points ?? 0;
}

async function openReward(tx: Transaction, customerId: string) {
  const [reward] = await tx
    .select()
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.customerId, customerId), isNull(loyaltyRewards.usedAt)));
  return reward ?? null;
}

/**
 * Bon expiré : il est clos et retire ses visites du compteur. Puis, si le
 * compteur atteint le nombre de visites, un nouveau bon est créé.
 */
async function refreshReward(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  config: Awaited<ReturnType<typeof loyaltyConfig>>,
  now: Date,
) {
  let reward: typeof loyaltyRewards.$inferSelect | null = await openReward(tx, customerId);
  if (reward && reward.expiresAt <= now) {
    // Clos une seule fois, même si deux pages le lisent en même temps.
    const [closed] = await tx
      .update(loyaltyRewards)
      .set({ usedAt: reward.expiresAt })
      .where(and(eq(loyaltyRewards.id, reward.id), isNull(loyaltyRewards.usedAt)))
      .returning({ id: loyaltyRewards.id });
    if (closed)
      await tx.insert(loyaltyEvents).values({
        tenantId,
        businessId: config.businessId,
        customerId,
        kind: "reward_used",
        points: -reward.visitsRequired,
        reason: "expired",
      });
    reward = null;
  }
  if (reward || !config.active) return reward;
  if ((await balanceOf(tx, [customerId])) < config.visitsRequired) return null;
  // Un seul bon en cours (règle de la base) : si un autre vient d'être créé, c'est lui qui compte.
  const [created] = await tx
    .insert(loyaltyRewards)
    .values({
      tenantId,
      businessId: config.businessId,
      customerId,
      label: config.rewardLabel ?? "",
      amountCents: config.rewardCents,
      visitsRequired: config.visitsRequired,
      expiresAt: new Date(now.getTime() + config.validityDays * DAY_MS),
    })
    .onConflictDoNothing()
    .returning();
  return created ?? (await openReward(tx, customerId));
}

/**
 * Suit le statut d'un rendez-vous : honoré, il rapporte un point (une seule
 * fois) ; ramené à « confirmé » ou « manqué » après avoir été honoré, le point
 * est retiré. Sans effet si le programme n'est pas actif.
 */
export async function trackAttendance(
  tx: Transaction,
  tenantId: string,
  appointment: { id: string; customerId: string; businessId: string },
  before: string,
  after: string,
  now = new Date(),
) {
  if (before === after) return;
  const config = await loyaltyConfig(tx, tenantId, appointment.businessId);
  // Solde des mouvements de ce rendez-vous : 1 s'il a rapporté son point, 0 sinon.
  // (Le rendez-vous est verrouillé par l'appelant : pas de double comptage.)
  const [{ net }] = await tx
    .select({ net: sql<number>`coalesce(sum(${loyaltyEvents.points}), 0)::int` })
    .from(loyaltyEvents)
    .where(
      and(
        eq(loyaltyEvents.appointmentId, appointment.id),
        inArray(loyaltyEvents.kind, ["visit", "visit_reverted"]),
      ),
    );
  const event = { tenantId, businessId: appointment.businessId, customerId: appointment.customerId };
  if (after === "attended") {
    if (!config.active || net > 0) return;
    await tx
      .insert(loyaltyEvents)
      .values({ ...event, kind: "visit", points: 1, appointmentId: appointment.id });
  } else if (before === "attended") {
    if (net <= 0) return;
    await tx
      .insert(loyaltyEvents)
      .values({ ...event, kind: "visit_reverted", points: -1, appointmentId: appointment.id });
  }
  await refreshReward(tx, tenantId, appointment.customerId, config, now);
}

/** Compteur d'une cliente (plusieurs fiches possibles : même téléphone), bon en cours et réglages. */
export async function customerLoyalty(
  tx: Transaction,
  tenantId: string,
  customerIds: string[],
  now = new Date(),
) {
  const config = await loyaltyConfig(tx, tenantId);
  if (customerIds.length === 0) return null;
  if (!config.active) {
    // Programme arrêté (réglage ou changement de pack) : plus de points, mais un bon
    // déjà gagné reste valable jusqu'à sa date de fin.
    const [reward] = await tx
      .select()
      .from(loyaltyRewards)
      .where(
        and(
          inArray(loyaltyRewards.customerId, customerIds),
          isNull(loyaltyRewards.usedAt),
          gt(loyaltyRewards.expiresAt, now),
        ),
      )
      .limit(1);
    if (!reward) return null;
    return {
      active: false,
      points: 0,
      visitsRequired: config.visitsRequired,
      remaining: 0,
      rewardLabel: config.rewardLabel,
      rewardCents: config.rewardCents,
      reward: {
        id: reward.id,
        label: reward.label,
        amountCents: reward.amountCents,
        expiresAt: reward.expiresAt,
      },
    };
  }
  let reward = null;
  for (const id of customerIds) reward ??= await refreshReward(tx, tenantId, id, config, now);
  const points = Math.max(0, await balanceOf(tx, customerIds));
  return {
    active: true,
    points,
    visitsRequired: config.visitsRequired,
    remaining: Math.max(0, config.visitsRequired - points),
    rewardLabel: config.rewardLabel,
    rewardCents: config.rewardCents,
    reward: reward
      ? {
          id: reward.id,
          label: reward.label,
          amountCents: reward.amountCents,
          expiresAt: reward.expiresAt,
        }
      : null,
  };
}

/** Fiche cliente (gérante) : compteur, bon en cours et derniers mouvements. */
export async function loyaltyForManager(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  now = new Date(),
) {
  const config = await loyaltyConfig(tx, tenantId);
  const summary = await customerLoyalty(tx, tenantId, [customerId], now);
  // Hors pack : la fiche n'affiche plus que le bon encore valable (s'il y en a un).
  if (!config.included && !summary) return null;
  const history = await tx
    .select()
    .from(loyaltyEvents)
    .where(eq(loyaltyEvents.customerId, customerId))
    .orderBy(desc(loyaltyEvents.createdAt))
    .limit(20);
  return { config, summary, history };
}

async function assertCustomer(tx: Transaction, tenantId: string, customerId: string) {
  const [customer] = await tx
    .select({ id: customers.id, businessId: customers.businessId })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
  if (!customer) throw new AppError("not_found");
  return customer;
}

export const adjustmentInput = z.object({
  points: z.coerce
    .number()
    .int()
    .min(-100)
    .max(100)
    .refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(300),
});

/** Ajustement à la main du compteur, tracé (qui, quand, pourquoi). Le compteur ne descend pas sous zéro. */
export async function adjustLoyalty(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  raw: z.input<typeof adjustmentInput>,
  userId: string | null,
  now = new Date(),
) {
  const input = adjustmentInput.parse(raw);
  const customer = await assertCustomer(tx, tenantId, customerId);
  const config = await loyaltyConfig(tx, tenantId, customer.businessId);
  if (!config.included) throw new AppError("feature_unavailable");
  const balance = await balanceOf(tx, [customerId]);
  if (balance + input.points < 0) throw new AppError("invalid", "points");
  await tx.insert(loyaltyEvents).values({
    tenantId,
    businessId: customer.businessId,
    customerId,
    kind: "manual_adjustment",
    points: input.points,
    reason: input.reason,
    createdByUserId: userId,
  });
  await refreshReward(tx, tenantId, customerId, config, now);
  return { before: balance, after: balance + input.points };
}

/** La gérante marque le bon comme utilisé : ses visites sont retirées du compteur. */
export async function redeemReward(
  tx: Transaction,
  tenantId: string,
  rewardId: string,
  userId: string | null,
  now = new Date(),
) {
  const [reward] = await tx
    .select()
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.id, rewardId), eq(loyaltyRewards.tenantId, tenantId)));
  if (!reward) throw new AppError("not_found");
  if (reward.usedAt || reward.expiresAt <= now) throw new AppError("reward_unavailable");
  // Utilisé une seule fois, même en cas de double clic.
  const [used] = await tx
    .update(loyaltyRewards)
    .set({ usedAt: now, usedByUserId: userId })
    .where(and(eq(loyaltyRewards.id, reward.id), isNull(loyaltyRewards.usedAt)))
    .returning({ id: loyaltyRewards.id });
  if (!used) throw new AppError("reward_unavailable");
  await tx.insert(loyaltyEvents).values({
    tenantId,
    businessId: reward.businessId,
    customerId: reward.customerId,
    kind: "reward_used",
    points: -reward.visitsRequired,
    createdByUserId: userId,
  });
  const config = await loyaltyConfig(tx, tenantId, reward.businessId);
  await refreshReward(tx, tenantId, reward.customerId, config, now);
  return { customerId: reward.customerId };
}
