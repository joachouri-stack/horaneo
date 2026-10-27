import { randomInt } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { promoCodes, tenants } from "@/db/schema";
import { addDays, DATE_PATTERN, localToUtc, utcToLocal } from "@/modules/booking/time";
import { AppError } from "@/modules/errors";
import { assertFeature } from "@/modules/quotas";
import { DEFAULT_BIRTHDAY_OFFER } from "@/config/defaults";

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
    // Codes personnels (anniversaire…) : créés automatiquement, ni listés ni modifiables ici.
    .where(and(eq(promoCodes.tenantId, tenantId), isNull(promoCodes.customerId)))
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
      .where(
        and(eq(promoCodes.id, promoCodeId), eq(promoCodes.tenantId, tenantId), isNull(promoCodes.customerId)),
      )
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
    .where(
      and(eq(promoCodes.id, promoCodeId), eq(promoCodes.tenantId, tenantId), isNull(promoCodes.customerId)),
    );
  if (!code) throw new AppError("not_found");
  // Un code déjà utilisé reste lié à ses rendez-vous : il est seulement désactivé.
  if (code.usedCount > 0) {
    await tx.update(promoCodes).set({ isActive: false }).where(eq(promoCodes.id, code.id));
    return { deleted: false };
  }
  await tx.delete(promoCodes).where(eq(promoCodes.id, code.id));
  return { deleted: true };
}

/**
 * Le champ « code promo » n'est affiché que s'il existe au moins un code actif
 * (codes personnels compris : la cliente fêtée doit pouvoir saisir le sien).
 */
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
  return { promoCodeId: row.id, code: row.code, discountCents, customerId: row.customerId };
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

/** Caractères des codes générés : sans ceux qui se confondent (0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(prefix: string) {
  const random = Array.from(
    { length: DEFAULT_BIRTHDAY_OFFER.codeLength },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
  // Préfixe lisible (traduit), ramené aux caractères permis d'un code promo.
  const clean = prefix
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 12);
  return clean ? `${clean}-${random}` : random;
}

/**
 * Code promo personnel d'une cliente (ex. anniversaire) : une seule utilisation,
 * par elle seule, valable d'aujourd'hui 0 h (heure de l'établissement) jusqu'au
 * soir du jour `today + validityDays` (fin exclusive : minuit le lendemain,
 * comme les codes saisis par la gérante). Unique dans l'entreprise. L'entreprise
 * est celle de la cliente (déclarée par l'appelant, ou donnée).
 */
export async function createPersonalPromoCode(
  tx: Transaction,
  tenantId: string,
  input: {
    businessId: string;
    customerId: string;
    discountPercent: number;
    validityDays: number;
    /** Début du code (ex. « ANNIV »), suivi de caractères aléatoires. */
    prefix: string;
    now?: Date;
  },
) {
  const timezone = await tenantTimezone(tx, tenantId);
  const today = utcToLocal(input.now ?? new Date(), timezone).date;
  const values = {
    tenantId,
    businessId: input.businessId,
    customerId: input.customerId,
    discountType: "percent" as const,
    discountValue: input.discountPercent,
    validFrom: localToUtc(today, "00:00", timezone),
    validUntil: localToUtc(addDays(today, input.validityDays + 1), "00:00", timezone),
    maxUses: 1,
    isActive: true,
  };
  // Un code déjà pris dans l'entreprise (index promo_codes_business_code_key) : on en tire un autre.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const [created] = await tx
      .insert(promoCodes)
      .values({ ...values, code: randomCode(input.prefix) })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
  }
  throw new Error("Aucun code promo libre après plusieurs essais.");
}
