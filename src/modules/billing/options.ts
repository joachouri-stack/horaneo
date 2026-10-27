import { and, asc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { planOptions, tenantOptions } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { getPlatformSetting } from "@/modules/settings";
import type { BillingGateway } from "./gateway";
import type { PricedOption } from "./option-total";

/**
 * Options à la carte (rôle plateforme pour toute écriture) : catalogue et
 * tarifs (admin), options actives de chaque site. Avec un abonnement Stripe,
 * chaque option est une ligne de l'abonnement ; les options actives du site
 * suivent ces lignes (voir syncTenantOptions, appelée à chaque événement Stripe).
 */

export type PlanOption = typeof planOptions.$inferSelect;

/** Catalogue, dans l'ordre d'affichage (options masquées comprises si `all`). */
export async function listPlanOptions(tx: Transaction, { all = false } = {}) {
  return tx
    .select()
    .from(planOptions)
    .where(all ? undefined : eq(planOptions.isActive, true))
    .orderBy(asc(planOptions.sortOrder), asc(planOptions.code));
}

/** Ce que le calcul du total a besoin de savoir d'une option. */
export function pricedOption(option: PlanOption): PricedOption {
  return {
    code: option.code,
    priceCents: option.priceCents,
    orderable: option.isActive && option.isAvailable,
    requires: option.requires,
  };
}

/** Prix Stripe mensuel d'une option, créé au besoin (avec son produit). */
export async function ensureOptionPrice(tx: Transaction, optionId: string, gateway: BillingGateway) {
  const [option] = await tx.select().from(planOptions).where(eq(planOptions.id, optionId));
  if (!option) throw new AppError("not_found");
  if (option.priceCents === null || option.priceCents <= 0) throw new AppError("invalid", "optionPrice");
  if (option.stripePriceId) return option.stripePriceId;
  const display = await getPlatformSetting(tx, "prices_display");
  const productId =
    option.stripeProductId ??
    (
      await gateway.createProduct({
        name: option.name.fr ?? Object.values(option.name)[0] ?? option.code,
        metadata: { option_id: option.id },
      })
    ).id;
  const price = await gateway.createPrice({
    productId,
    amountCents: option.priceCents,
    currency: option.currency,
    interval: "month",
    taxInclusive: display === "TTC",
    metadata: { option_id: option.id },
  });
  await tx
    .update(planOptions)
    .set({ stripeProductId: productId, stripePriceId: price.id })
    .where(eq(planOptions.id, option.id));
  return price.id;
}

/** Options actives d'un site, avec leur fiche. */
export async function listTenantOptions(tx: Transaction, tenantId: string) {
  return tx
    .select({ option: planOptions, stripeSubscriptionItemId: tenantOptions.stripeSubscriptionItemId })
    .from(tenantOptions)
    .innerJoin(planOptions, eq(planOptions.id, tenantOptions.optionId))
    .where(eq(tenantOptions.tenantId, tenantId))
    .orderBy(asc(planOptions.sortOrder));
}

/**
 * Aligne les options du site sur les lignes de son abonnement Stripe : une
 * ligne ajoutée active l'option, une ligne retirée la coupe. Une ligne dont le
 * prix ne désigne aucune option connue est ignorée.
 */
export async function syncTenantOptions(
  tx: Transaction,
  tenantId: string,
  items: { itemId: string; optionId: string }[],
) {
  const known = items.length
    ? await tx
        .select({ id: planOptions.id })
        .from(planOptions)
        .where(
          inArray(
            planOptions.id,
            items.map((item) => item.optionId).filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
          ),
        )
    : [];
  const valid = items.filter((item) => known.some((row) => row.id === item.optionId));
  // Seules les options facturées par l'abonnement suivent Stripe : une option offerte
  // à la main (sans ligne d'abonnement) reste active.
  await tx.delete(tenantOptions).where(
    and(
      eq(tenantOptions.tenantId, tenantId),
      isNotNull(tenantOptions.stripeSubscriptionItemId),
      valid.length
        ? notInArray(
            tenantOptions.optionId,
            valid.map((item) => item.optionId),
          )
        : undefined,
    ),
  );
  for (const item of valid) {
    await tx
      .insert(tenantOptions)
      .values({ tenantId, optionId: item.optionId, stripeSubscriptionItemId: item.itemId })
      .onConflictDoUpdate({
        target: [tenantOptions.tenantId, tenantOptions.optionId],
        set: { stripeSubscriptionItemId: item.itemId },
      });
  }
  return valid.length;
}

const optionalEuros = z
  .string()
  .trim()
  .regex(/^(\d{1,5}([.,]\d{1,2})?)?$/)
  .default("");

export const planOptionInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).default(""),
  /** Tarif mensuel en euros ; vide : tarif à définir (l'option ne se commande pas). */
  price: optionalEuros,
  isActive: z.boolean(),
  isAvailable: z.boolean(),
});

/**
 * Modifie une option du catalogue. Un nouveau tarif crée un nouveau prix
 * Stripe pour les prochaines souscriptions ; les abonnés gardent l'ancien.
 */
export async function savePlanOption(
  tx: Transaction,
  optionId: string,
  raw: z.input<typeof planOptionInput>,
  gateway: BillingGateway | null,
) {
  const input = planOptionInput.parse(raw);
  const [option] = await tx.select().from(planOptions).where(eq(planOptions.id, optionId));
  if (!option) throw new AppError("not_found");
  const priceCents = input.price ? Math.round(Number(input.price.replace(",", ".")) * 100) : null;
  const priceChanged = priceCents !== option.priceCents;
  await tx
    .update(planOptions)
    .set({
      name: { ...option.name, fr: input.name },
      description: { ...option.description, fr: input.description },
      priceCents,
      isActive: input.isActive,
      isAvailable: input.isAvailable,
      ...(priceChanged ? { stripePriceId: null } : {}),
    })
    .where(eq(planOptions.id, option.id));
  if (priceChanged && priceCents && gateway) await ensureOptionPrice(tx, option.id, gateway);
  return { priceChanged, before: option.priceCents, after: priceCents };
}
