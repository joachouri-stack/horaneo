import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { priceInput } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import { assertFeature } from "@/modules/quotas";

/**
 * Remise des commandes de la boutique (entreprise déclarée) : retrait sur place et/ou
 * livraison, frais de livraison et montant à partir duquel elle est offerte.
 */

export type ShopFulfillment = {
  pickup: boolean;
  delivery: boolean;
  deliveryFeeCents: number;
  /** Livraison offerte à partir de ce montant (null : jamais offerte). */
  freeDeliveryFromCents: number | null;
};

export async function shopFulfillment(tx: Transaction, businessId: string): Promise<ShopFulfillment> {
  const [row] = await tx
    .select({
      pickup: businessSettings.shopPickupEnabled,
      delivery: businessSettings.shopDeliveryEnabled,
      deliveryFeeCents: businessSettings.shopDeliveryFeeCents,
      freeDeliveryFromCents: businessSettings.shopFreeDeliveryFromCents,
    })
    .from(businessSettings)
    .where(eq(businessSettings.businessId, businessId));
  if (!row) throw new AppError("not_found");
  return row;
}

/** Frais de livraison d'une commande (0 si offerte à partir du montant réglé). */
export function deliveryFee(settings: ShopFulfillment, subtotalCents: number): number {
  if (settings.freeDeliveryFromCents !== null && subtotalCents >= settings.freeDeliveryFromCents) return 0;
  return settings.deliveryFeeCents;
}

const optionalPrice = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(priceInput.optional());

export const shopSettingsInput = z.object({
  pickup: z.boolean(),
  delivery: z.boolean(),
  deliveryFee: optionalPrice,
  freeDeliveryFrom: optionalPrice,
});

export async function updateShopSettings(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof shopSettingsInput>,
) {
  await assertFeature(tx, tenantId, "commerce");
  const input = shopSettingsInput.parse(raw);
  // Au moins une façon de remettre les commandes.
  if (!input.pickup && !input.delivery) throw new AppError("shop_fulfillment_required");
  const businessId = await currentBusinessId(tx);
  if (!businessId) throw new AppError("not_found");
  const [updated] = await tx
    .update(businessSettings)
    .set({
      shopPickupEnabled: input.pickup,
      shopDeliveryEnabled: input.delivery,
      shopDeliveryFeeCents: input.deliveryFee ?? 0,
      shopFreeDeliveryFromCents: input.freeDeliveryFrom ?? null,
    })
    .where(eq(businessSettings.businessId, businessId))
    .returning();
  if (!updated) throw new AppError("not_found");
  return updated;
}

/** Réglages de remise de l'entreprise déclarée (espace gérante). */
export async function currentShopFulfillment(tx: Transaction): Promise<ShopFulfillment> {
  const businessId = await currentBusinessId(tx);
  if (!businessId) throw new AppError("not_found");
  return shopFulfillment(tx, businessId);
}
