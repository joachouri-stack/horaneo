import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { getTenantPlan } from "@/modules/quotas";

/**
 * Relance des clients qui ne reviennent plus (pack avec les codes promo) : quand un
 * client n'est pas venu depuis le délai choisi et n'a pas de rendez-vous prévu, il
 * reçoit un e-mail au nom de l'entreprise, avec une réduction personnelle si la
 * gérante en offre une. Seulement les clients qui ont accepté de recevoir des offres.
 * Réglée dans Plus → Fidélité ; envoyée par la tâche planifiée (messages/schedule.ts).
 */

export const winbackInput = z.object({
  enabled: z.boolean(),
  afterDays: z.coerce.number().int().min(30).max(365),
  discountPercent: z.coerce.number().int().min(0).max(100),
  validityDays: z.coerce.number().int().min(1).max(90),
});

async function businessOf(tx: Transaction, businessId?: string) {
  const id = businessId ?? (await currentBusinessId(tx));
  if (!id) throw new AppError("not_found");
  return id;
}

/** Réglages de la relance et accès du pack (fonction « promoCodes »). */
export async function winbackConfig(tx: Transaction, tenantId: string, businessId?: string) {
  const id = await businessOf(tx, businessId);
  const { features } = await getTenantPlan(tx, tenantId);
  const [settings] = await tx
    .select({
      enabled: businessSettings.winbackEnabled,
      afterDays: businessSettings.winbackAfterDays,
      discountPercent: businessSettings.winbackDiscountPercent,
      validityDays: businessSettings.winbackOfferDays,
    })
    .from(businessSettings)
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)));
  if (!settings) throw new AppError("not_found");
  const included = Boolean(features.promoCodes);
  return { businessId: id, included, active: included && settings.enabled, ...settings };
}

export async function setWinback(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof winbackInput>,
  businessId?: string,
) {
  const input = winbackInput.parse(raw);
  const config = await winbackConfig(tx, tenantId, businessId);
  if (!config.included) throw new AppError("feature_unavailable", "promoCodes");
  await tx
    .update(businessSettings)
    .set({
      winbackEnabled: input.enabled,
      winbackAfterDays: input.afterDays,
      winbackDiscountPercent: input.discountPercent,
      winbackOfferDays: input.validityDays,
    })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, config.businessId)));
  return input;
}
