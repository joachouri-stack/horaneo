import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { promoCodes, tenants } from "@/db/schema";
import { addDays, DATE_PATTERN, localToUtc, utcToLocal } from "@/modules/booking/time";
import { AppError } from "@/modules/errors";
import { assertFeature } from "@/modules/quotas";

/**
 * Codes promo (packs avec l'option « codes promo »), saisis par la cliente au
 * moment de réserver en ligne. La réduction s'applique au total ; l'acompte se
 * calcule ensuite sur le total réduit (décision n° 8).
 */

export type PromoRule = {
  discountType: "percent" | "fixed";
  discountValue: number;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  usedCount: number;
  isActive: boolean;
};

/** Réduction en centimes (jamais plus que le total), ou null si le code n'est pas utilisable. */
export function computeDiscount(rule: PromoRule, totalCents: number, now: Date): number | null {
  if (!rule.isActive) return null;
  if (rule.validFrom && now < rule.validFrom) return null;
  if (rule.validUntil && now >= rule.validUntil) return null;
  if (rule.maxUses !== null && rule.usedCount >= rule.maxUses) return null;
  const discount =
    rule.discountType === "percent"
      ? Math.round((totalCents * rule.discountValue) / 100)
      : rule.discountValue;
  return Math.max(0, Math.min(discount, totalCents));
}

export const promoCodeInput = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/),
    discountType: z.enum(["percent", "fixed"]),
    /** Pourcentage, ou montant en euros (« 10 », « 10,50 »). */
    discountValue: z
      .string()
      .trim()
      .regex(/^\d{1,5}([.,]\d{1,2})?$/),
    validFrom: z.string().regex(DATE_PATTERN).optional().or(z.literal("")),
    validUntil: z.string().regex(DATE_PATTERN).optional().or(z.literal("")),
    maxUses: z.coerce.number().int().min(1).max(100000).optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  })
  .refine((input) => !input.validFrom || !input.validUntil || input.validFrom <= input.validUntil, {
    path: ["validUntil"],
  });

async function tenantTimezone(tx: Transaction, tenantId: string) {
  const [tenant] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  return tenant.timezone;
}

export async function listPromoCodes(tx: Transaction, tenantId: string) {
  const timezone = await tenantTimezone(tx, tenantId);
  const rows = await tx
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.tenantId, tenantId))
    .orderBy(asc(promoCodes.code));
  // Dates affichées dans le fuseau de l'établissement ; « jusqu'au » est inclusif.
  return rows.map((row) => ({
    ...row,
    validFromDate: row.validFrom ? utcToLocal(row.validFrom, timezone).date : "",
    validUntilDate: row.validUntil ? addDays(utcToLocal(row.validUntil, timezone).date, -1) : "",
  }));
}

export async function savePromoCode(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof promoCodeInput>,
  promoCodeId?: string,
) {
  await assertFeature(tx, tenantId, "promoCodes");
  const input = promoCodeInput.parse(raw);
  const timezone = await tenantTimezone(tx, tenantId);
  const amount = Number(input.discountValue.replace(",", "."));
  const discountValue = input.discountType === "percent" ? Math.round(amount) : Math.round(amount * 100);
  if (discountValue < 1 || (input.discountType === "percent" && discountValue > 100))
    throw new AppError("invalid", "discountValue");
  const values = {
    code: input.code,
    discountType: input.discountType,
    discountValue,
    validFrom: input.validFrom ? localToUtc(input.validFrom, "00:00", timezone) : null,
    // Valable toute la journée de fin : jusqu'à minuit le lendemain.
    validUntil: input.validUntil ? localToUtc(addDays(input.validUntil, 1), "00:00", timezone) : null,
    maxUses: typeof input.maxUses === "number" ? input.maxUses : null,
    isActive: input.isActive,
  };
  const duplicate = await tx
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(and(eq(promoCodes.tenantId, tenantId), sql`upper(${promoCodes.code}) = ${input.code}`));
  if (duplicate.some((row) => row.id !== promoCodeId)) throw new AppError("promo_code_taken", "code");

  if (promoCodeId) {
    const [updated] = await tx
      .update(promoCodes)
      .set(values)
      .where(and(eq(promoCodes.id, promoCodeId), eq(promoCodes.tenantId, tenantId)))
      .returning();
    if (!updated) throw new AppError("not_found");
    if (updated.maxUses !== null && updated.usedCount > updated.maxUses)
      throw new AppError("invalid", "maxUses");
    return updated;
  }
  const [created] = await tx
    .insert(promoCodes)
    .values({ tenantId, ...values })
    .returning();
  return created;
}

export async function deletePromoCode(tx: Transaction, tenantId: string, promoCodeId: string) {
  const [code] = await tx
    .select()
    .from(promoCodes)
    .where(and(eq(promoCodes.id, promoCodeId), eq(promoCodes.tenantId, tenantId)));
  if (!code) throw new AppError("not_found");
  // Un code déjà utilisé reste lié à ses rendez-vous : il est seulement désactivé.
  if (code.usedCount > 0) {
    await tx.update(promoCodes).set({ isActive: false }).where(eq(promoCodes.id, code.id));
    return { deleted: false };
  }
  await tx.delete(promoCodes).where(eq(promoCodes.id, code.id));
  return { deleted: true };
}

/** Le champ « code promo » n'est affiché que s'il existe au moins un code actif. */
export async function hasActivePromoCodes(tx: Transaction, tenantId: string) {
  const rows = await tx
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(and(eq(promoCodes.tenantId, tenantId), eq(promoCodes.isActive, true)))
    .limit(1);
  return rows.length > 0;
}

async function findCode(tx: Transaction, tenantId: string, code: string) {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,30}$/.test(normalized)) return null;
  const [row] = await tx
    .select()
    .from(promoCodes)
    .where(and(eq(promoCodes.tenantId, tenantId), sql`upper(${promoCodes.code}) = ${normalized}`));
  return row ?? null;
}

/** Vérifie un code saisi par la cliente (sans le consommer). */
export async function previewPromo(
  tx: Transaction,
  tenantId: string,
  code: string,
  totalCents: number,
  now = new Date(),
) {
  await assertFeature(tx, tenantId, "promoCodes").catch(() => {
    throw new AppError("promo_code_invalid", "promoCode");
  });
  const row = await findCode(tx, tenantId, code);
  const discountCents = row ? computeDiscount(row, totalCents, now) : null;
  if (!row || discountCents === null) throw new AppError("promo_code_invalid", "promoCode");
  return { promoCodeId: row.id, code: row.code, discountCents };
}

/**
 * Consomme une utilisation du code, de façon atomique : deux réservations
 * simultanées ne peuvent pas dépasser le nombre d'utilisations prévu.
 */
export async function redeemPromo(
  tx: Transaction,
  tenantId: string,
  code: string,
  totalCents: number,
  now = new Date(),
) {
  const preview = await previewPromo(tx, tenantId, code, totalCents, now);
  const rows = await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(
      and(
        eq(promoCodes.id, preview.promoCodeId),
        sql`(${promoCodes.maxUses} is null or ${promoCodes.usedCount} < ${promoCodes.maxUses})`,
      ),
    )
    .returning({ id: promoCodes.id });
  if (rows.length === 0) throw new AppError("promo_code_invalid", "promoCode");
  return preview;
}
