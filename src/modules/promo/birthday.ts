import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { getTenantPlan } from "@/modules/quotas";

/**
 * Offre d'anniversaire d'une entreprise (pack avec les codes promo) : le jour
 * de l'anniversaire de la cliente, un e-mail au nom de l'entreprise lui offre
 * une réduction personnelle (code à usage unique). Réglée par la gérante dans
 * Plus → Fidélité ; envoyée par la tâche planifiée (messages/schedule.ts).
 * Fonctions (tx, tenantId, …) : entreprise déclarée par l'appelant, ou donnée.
 */

export const birthdayOfferInput = z.object({
  enabled: z.boolean(),
  discountPercent: z.coerce.number().int().min(1).max(100),
  validityDays: z.coerce.number().int().min(1).max(90),
});

async function businessOf(tx: Transaction, businessId?: string) {
  const id = businessId ?? (await currentBusinessId(tx));
  if (!id) throw new AppError("not_found");
  return id;
}

/** Réglages de l'offre et accès du pack (fonction « promoCodes »). */
export async function birthdayOfferConfig(tx: Transaction, tenantId: string, businessId?: string) {
  const id = await businessOf(tx, businessId);
  const { features } = await getTenantPlan(tx, tenantId);
  const [settings] = await tx
    .select({
      enabled: businessSettings.birthdayOfferEnabled,
      discountPercent: businessSettings.birthdayDiscountPercent,
      validityDays: businessSettings.birthdayOfferDays,
    })
    .from(businessSettings)
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)));
  if (!settings) throw new AppError("not_found");
  const included = Boolean(features.promoCodes);
  return { businessId: id, included, active: included && settings.enabled, ...settings };
}

export async function setBirthdayOffer(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof birthdayOfferInput>,
  businessId?: string,
) {
  const input = birthdayOfferInput.parse(raw);
  const config = await birthdayOfferConfig(tx, tenantId, businessId);
  if (!config.included) throw new AppError("feature_unavailable", "promoCodes");
  await tx
    .update(businessSettings)
    .set({
      birthdayOfferEnabled: input.enabled,
      birthdayDiscountPercent: input.discountPercent,
      birthdayOfferDays: input.validityDays,
    })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, config.businessId)));
  return input;
}
