import { tenantFeatures } from "@/modules/billing/entitlements";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import {
  plans,
  promotionServices,
  promotions,
  servicePriceHistory,
  services,
  tenants,
  type PlanFeatures,
} from "@/db/schema";
import { DATE_PATTERN, localToUtc, utcToLocal } from "@/modules/booking/time";
import { setLocalized } from "@/modules/content/localized";
import { AppError } from "@/modules/errors";
import { parseMoney } from "@/modules/money";

/**
 * Promotions datées : pendant la période, le site affiche un bandeau et le prix
 * barré. L'« ancien prix » est le prix le plus bas pratiqué dans les 30 jours
 * qui précèdent la promotion (règle française, la plus sûre) : une hausse de
 * prix juste avant une promotion ne peut donc pas gonfler la réduction affichée.
 */

export const REFERENCE_DAYS = 30;

export type PricePoint = { priceCents: number; startsAt: Date };

/** Prix le plus bas pratiqué pendant les 30 jours avant `start` (prix en vigueur au début compris). */
export function referencePrice(history: PricePoint[], start: Date, days = REFERENCE_DAYS): number | null {
  const windowStart = new Date(start.getTime() - days * 86_400_000);
  const sorted = [...history].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const inWindow = sorted.filter((point) => point.startsAt > windowStart && point.startsAt <= start);
  const before = sorted.filter((point) => point.startsAt <= windowStart).at(-1);
  const candidates = [...(before ? [before] : []), ...inWindow];
  return candidates.length ? Math.min(...candidates.map((point) => point.priceCents)) : null;
}

/** Prix réduit : pourcentage du prix actuel, ou montant retiré (jamais négatif). */
export function discountedPrice(priceCents: number, type: "percent" | "fixed", value: number): number {
  return type === "percent"
    ? Math.round((priceCents * (100 - value)) / 100)
    : Math.max(0, priceCents - value);
}

export type ActivePromotion = {
  promotionId: string;
  title: string;
  priceCents: number;
  /** Prix barré. */
  referenceCents: number;
  endsOn: string;
};

// ─── Gestion (gérante) ────────────────────────────────────────────────────────

export const promotionInput = z
  .object({
    title: z.string().trim().min(2).max(80),
    serviceIds: z.array(z.uuid()).min(1, "serviceIds").max(100),
    discountType: z.enum(["percent", "fixed"]),
    /** « 20 » (pour 20 %) ou « 10 » / « 10,50 » (euros retirés). */
    discountValue: z.string().trim().min(1),
    startsOn: z.string().regex(DATE_PATTERN),
    endsOn: z.string().regex(DATE_PATTERN),
  })
  .refine((input) => input.startsOn <= input.endsOn, { path: ["endsOn"], message: "dates" });

async function assertFeature(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ features: tenantFeatures, locale: tenants.defaultLocale })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  if (!(row.features as PlanFeatures).promotions) throw new AppError("feature_unavailable", "promotions");
  return row.locale;
}

export async function listPromotions(tx: Transaction, tenantId: string) {
  const rows = await tx
    .select()
    .from(promotions)
    .where(eq(promotions.tenantId, tenantId))
    .orderBy(desc(promotions.endsOn), asc(promotions.startsOn));
  const links = rows.length
    ? await tx
        .select()
        .from(promotionServices)
        .where(
          inArray(
            promotionServices.promotionId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  return rows.map((row) => ({
    ...row,
    serviceIds: links.filter((link) => link.promotionId === row.id).map((link) => link.serviceId),
  }));
}

export async function savePromotion(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof promotionInput>,
  promotionId?: string,
) {
  const input = promotionInput.parse(raw);
  const locale = await assertFeature(tx, tenantId);
  const value =
    input.discountType === "percent"
      ? Number(input.discountValue.replace(",", "."))
      : parseMoney(input.discountValue);
  if (!Number.isInteger(value) || value <= 0 || (input.discountType === "percent" && value >= 100)) {
    throw new AppError("invalid", "discountValue");
  }
  const chosen = await tx
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.tenantId, tenantId), inArray(services.id, input.serviceIds)));
  if (chosen.length !== new Set(input.serviceIds).size)
    throw new AppError("service_unavailable", "serviceIds");

  let id = promotionId;
  if (id) {
    const [existing] = await tx
      .select()
      .from(promotions)
      .where(and(eq(promotions.tenantId, tenantId), eq(promotions.id, id)));
    if (!existing) throw new AppError("not_found");
    await tx
      .update(promotions)
      .set({
        title: setLocalized(existing.title, locale, input.title),
        discountType: input.discountType,
        discountValue: value,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      })
      .where(eq(promotions.id, id));
    await tx.delete(promotionServices).where(eq(promotionServices.promotionId, id));
  } else {
    const [created] = await tx
      .insert(promotions)
      .values({
        tenantId,
        title: setLocalized({}, locale, input.title),
        discountType: input.discountType,
        discountValue: value,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      })
      .returning();
    id = created.id;
  }
  await tx
    .insert(promotionServices)
    .values([...new Set(input.serviceIds)].map((serviceId) => ({ tenantId, promotionId: id!, serviceId })));
  return { id };
}

export async function deletePromotion(tx: Transaction, tenantId: string, promotionId: string) {
  const deleted = await tx
    .delete(promotions)
    .where(and(eq(promotions.tenantId, tenantId), eq(promotions.id, promotionId)))
    .returning({ id: promotions.id });
  if (deleted.length === 0) throw new AppError("not_found");
}

// ─── Prix pendant les promotions (site, réservation) ─────────────────────────

/**
 * Promotions en cours aujourd'hui (fuseau de l'établissement), prestation par
 * prestation : prix réduit et prix barré. Une prestation dont le prix réduit ne
 * serait pas inférieur au prix de référence n'est pas présentée en promotion.
 */
export async function activePromotionPrices(
  tx: Transaction,
  tenantId: string,
  options: { timezone: string; now?: Date; locale?: string },
): Promise<Map<string, ActivePromotion>> {
  const now = options.now ?? new Date();
  const today = utcToLocal(now, options.timezone).date;
  const rows = await tx
    .select({
      promotionId: promotions.id,
      title: promotions.title,
      discountType: promotions.discountType,
      discountValue: promotions.discountValue,
      startsOn: promotions.startsOn,
      endsOn: promotions.endsOn,
      serviceId: services.id,
      priceCents: services.priceCents,
    })
    .from(promotions)
    .innerJoin(promotionServices, eq(promotionServices.promotionId, promotions.id))
    .innerJoin(services, eq(services.id, promotionServices.serviceId))
    .where(
      and(
        eq(promotions.tenantId, tenantId),
        lte(promotions.startsOn, today),
        gte(promotions.endsOn, today),
        eq(services.isActive, true),
      ),
    );
  const result = new Map<string, ActivePromotion>();
  if (rows.length === 0) return result;
  const history = await tx
    .select()
    .from(servicePriceHistory)
    .where(
      and(
        eq(servicePriceHistory.tenantId, tenantId),
        inArray(
          servicePriceHistory.serviceId,
          rows.map((row) => row.serviceId),
        ),
      ),
    )
    .orderBy(asc(servicePriceHistory.startsAt));
  const lang = (options.locale ?? "fr") as "fr";
  for (const row of rows) {
    // Début de la promotion : minuit le premier jour, dans le fuseau de l'établissement.
    const start = localToUtc(row.startsOn, "00:00", options.timezone);
    const points = history.filter((point) => point.serviceId === row.serviceId);
    const reference = referencePrice(points, start) ?? row.priceCents;
    const price = discountedPrice(row.priceCents, row.discountType, row.discountValue);
    if (price >= reference) continue;
    const current = result.get(row.serviceId);
    if (current && current.priceCents <= price) continue;
    result.set(row.serviceId, {
      promotionId: row.promotionId,
      title: row.title[lang] ?? Object.values(row.title)[0] ?? "",
      priceCents: price,
      referenceCents: reference,
      endsOn: row.endsOn,
    });
  }
  return result;
}
