import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { launchOfferClaims, launchOffers, orders, plans, tenants, users } from "@/db/schema";
import { AppError } from "@/modules/errors";

/**
 * Offres de lancement à places limitées (ex. tablette offerte aux 100 premiers
 * abonnés Business avec engagement). Rôle plateforme uniquement.
 * - Une place est retenue à la commande (« reserved »), confirmée par le
 *   premier paiement (« pending_review »), puis l'équipe vérifie
 *   l'éligibilité (« eligible ») et expédie (« shipped »), ou refuse.
 * - Une place retenue sans paiement sous 24 h est libérée.
 * - L'offre s'arrête d'elle-même quand toutes les places sont prises : le
 *   nombre de places restantes affiché est donc exact.
 */

const RESERVATION_HOURS = 24;
const HOLDING = ["pending_review", "eligible", "shipped"] as const;

/** Places prises : confirmées, ou retenues depuis moins de 24 h. */
function holdsPlace(now: Date) {
  const since = new Date(now.getTime() - RESERVATION_HOURS * 3_600_000);
  return or(
    inArray(launchOfferClaims.status, [...HOLDING]),
    and(eq(launchOfferClaims.status, "reserved"), gt(launchOfferClaims.createdAt, since)),
  );
}

async function takenPlaces(tx: Transaction, offerId: string, now: Date, excludeOrderId?: string) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(launchOfferClaims)
    .where(
      and(
        eq(launchOfferClaims.offerId, offerId),
        holdsPlace(now),
        excludeOrderId ? sql`${launchOfferClaims.orderId} IS DISTINCT FROM ${excludeOrderId}` : undefined,
      ),
    );
  return row?.count ?? 0;
}

export type LaunchOfferView = typeof launchOffers.$inferSelect & {
  planCode: string;
  taken: number;
  remaining: number;
  /** Proposée en ce moment : active, pas terminée, et des places restent. */
  open: boolean;
};

/** Offres, avec leurs places restantes (site commercial : seulement les ouvertes). */
export async function listLaunchOffers(tx: Transaction, { openOnly = false, now = new Date() } = {}) {
  const rows = await tx
    .select({ offer: launchOffers, planCode: plans.code })
    .from(launchOffers)
    .innerJoin(plans, eq(plans.id, launchOffers.planId))
    .orderBy(asc(launchOffers.createdAt));
  const views: LaunchOfferView[] = [];
  for (const { offer, planCode } of rows) {
    const taken = await takenPlaces(tx, offer.id, now);
    const remaining = Math.max(0, offer.quota - taken);
    const open = offer.isActive && remaining > 0 && (!offer.endsAt || offer.endsAt > now);
    if (!openOnly || open) views.push({ ...offer, planCode, taken, remaining, open });
  }
  return views;
}

/**
 * Commande : retient une place si le pack et la formule y donnent droit, et
 * libère celle d'une commande reprise qui n'y donne plus droit. Renvoie
 * l'offre retenue, ou null.
 */
export async function reserveForOrder(
  tx: Transaction,
  input: { orderId: string; userId: string; planId: string; withCommitment: boolean },
  now = new Date(),
) {
  const [offer] = await tx
    .select()
    .from(launchOffers)
    .where(and(eq(launchOffers.planId, input.planId), eq(launchOffers.isActive, true)))
    .orderBy(asc(launchOffers.createdAt))
    .limit(1)
    // Deux commandes en même temps ne peuvent pas prendre la dernière place.
    .for("update");
  const eligible =
    offer &&
    (!offer.requiresCommitment || input.withCommitment) &&
    (!offer.endsAt || offer.endsAt > now) &&
    (await takenPlaces(tx, offer.id, now, input.orderId)) < offer.quota;
  // Place d'une version précédente de la commande (autre pack ou autre formule) : libérée.
  await tx
    .update(launchOfferClaims)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(launchOfferClaims.orderId, input.orderId),
        eq(launchOfferClaims.status, "reserved"),
        eligible ? sql`${launchOfferClaims.offerId} <> ${offer.id}` : undefined,
      ),
    );
  if (!eligible) return null;
  await tx
    .insert(launchOfferClaims)
    .values({ offerId: offer.id, orderId: input.orderId, userId: input.userId, status: "reserved" })
    .onConflictDoUpdate({
      target: [launchOfferClaims.offerId, launchOfferClaims.orderId],
      set: { status: "reserved", createdAt: now },
    });
  return offer;
}

/**
 * Premier paiement reçu : la place est confirmée (éligibilité à vérifier).
 * Une réservation expirée n'est confirmée que s'il reste une place.
 */
export async function confirmOrderClaim(tx: Transaction, orderId: string, now = new Date()) {
  const [claim] = await tx
    .select()
    .from(launchOfferClaims)
    .where(and(eq(launchOfferClaims.orderId, orderId), eq(launchOfferClaims.status, "reserved")));
  if (!claim) return null;
  const [offer] = await tx
    .select()
    .from(launchOffers)
    .where(eq(launchOffers.id, claim.offerId))
    .for("update");
  const free = (await takenPlaces(tx, offer.id, now, orderId)) < offer.quota;
  const status = free ? ("pending_review" as const) : ("cancelled" as const);
  await tx.update(launchOfferClaims).set({ status }).where(eq(launchOfferClaims.id, claim.id));
  return status;
}

/** Commande refusée ou abandonnée : la place est libérée. */
export async function releaseOrderClaim(tx: Transaction, orderId: string) {
  await tx
    .update(launchOfferClaims)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(launchOfferClaims.orderId, orderId),
        inArray(launchOfferClaims.status, ["reserved", "pending_review"]),
      ),
    );
}

/** Site créé depuis la commande : la place suit l'établissement. */
export async function linkOrderClaimToTenant(tx: Transaction, orderId: string, tenantId: string) {
  await tx.update(launchOfferClaims).set({ tenantId }).where(eq(launchOfferClaims.orderId, orderId));
}

/** Places attribuées (admin), les plus récentes d'abord. */
export async function listClaims(tx: Transaction, offerId: string) {
  return tx
    .select({
      claim: launchOfferClaims,
      email: users.email,
      businessName: orders.businessName,
      tenantName: tenants.name,
    })
    .from(launchOfferClaims)
    .leftJoin(users, eq(users.id, launchOfferClaims.userId))
    .leftJoin(orders, eq(orders.id, launchOfferClaims.orderId))
    .leftJoin(tenants, eq(tenants.id, launchOfferClaims.tenantId))
    .where(eq(launchOfferClaims.offerId, offerId))
    .orderBy(desc(launchOfferClaims.createdAt));
}

const NEXT_STATUSES = {
  reserved: ["cancelled"],
  pending_review: ["eligible", "refused"],
  eligible: ["shipped", "refused"],
  shipped: [],
  refused: [],
  cancelled: [],
} as const;

/** Étape suivante d'une place (vérification d'éligibilité, expédition, refus). */
export async function setClaimStatus(
  tx: Transaction,
  claimId: string,
  status: "eligible" | "shipped" | "refused" | "cancelled",
  note?: string,
) {
  const [claim] = await tx.select().from(launchOfferClaims).where(eq(launchOfferClaims.id, claimId));
  if (!claim) throw new AppError("not_found");
  if (!(NEXT_STATUSES[claim.status] as readonly string[]).includes(status))
    throw new AppError("invalid", "status");
  await tx
    .update(launchOfferClaims)
    .set({ status, note: note?.trim().slice(0, 500) || claim.note })
    .where(eq(launchOfferClaims.id, claimId));
  return { from: claim.status, to: status };
}

export const launchOfferInput = z.object({
  title: z.string().trim().min(3).max(80),
  conditions: z.string().trim().min(10).max(1000),
  quota: z.coerce.number().int().min(0).max(100_000),
  isActive: z.boolean(),
  requiresCommitment: z.boolean(),
  /** Date de fin (AAAA-MM-JJ) ; vide : sans date de fin. */
  endsOn: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .default(""),
});

export async function saveLaunchOffer(
  tx: Transaction,
  offerId: string,
  raw: z.input<typeof launchOfferInput>,
) {
  const input = launchOfferInput.parse(raw);
  const [offer] = await tx.select().from(launchOffers).where(eq(launchOffers.id, offerId));
  if (!offer) throw new AppError("not_found");
  await tx
    .update(launchOffers)
    .set({
      title: { ...offer.title, fr: input.title },
      conditions: { ...offer.conditions, fr: input.conditions },
      quota: input.quota,
      isActive: input.isActive,
      requiresCommitment: input.requiresCommitment,
      endsAt: input.endsOn ? new Date(`${input.endsOn}T23:59:59Z`) : null,
    })
    .where(eq(launchOffers.id, offerId));
  return input;
}
