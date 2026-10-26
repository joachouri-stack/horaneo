import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  customerDataRequests,
  giftCards,
  promoCodes,
  promotions,
  staffMembers,
  timeOff,
  updateRequests,
} from "@/db/schema";
import { utcToLocal } from "@/modules/booking/time";

/**
 * Compteurs affichés sur les tuiles de « Tous les outils » : membres actifs, absences à venir,
 * promotions et codes en cours, cartes cadeaux utilisables, demandes en attente.
 */
export async function toolsOverview(tx: Transaction, tenantId: string, timezone: string, now = new Date()) {
  const today = utcToLocal(now, timezone).date;
  const count = sql<number>`count(*)`.mapWith(Number);
  const [team] = await tx
    .select({ count })
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.isActive, true)));
  const [absences] = await tx
    .select({ count })
    .from(timeOff)
    .where(and(eq(timeOff.tenantId, tenantId), gt(timeOff.endsAt, now)));
  const [activePromotions] = await tx
    .select({ count })
    .from(promotions)
    .where(
      and(eq(promotions.tenantId, tenantId), lte(promotions.startsOn, today), gte(promotions.endsOn, today)),
    );
  const [codes] = await tx
    .select({ count })
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.tenantId, tenantId),
        eq(promoCodes.isActive, true),
        or(isNull(promoCodes.validUntil), gt(promoCodes.validUntil, now)),
      ),
    );
  const [cards] = await tx
    .select({ count })
    .from(giftCards)
    .where(
      and(
        eq(giftCards.tenantId, tenantId),
        eq(giftCards.status, "active"),
        gt(giftCards.balanceCents, 0),
        gt(giftCards.expiresAt, now),
      ),
    );
  const [requests] = await tx
    .select({ count })
    .from(updateRequests)
    .where(
      and(eq(updateRequests.tenantId, tenantId), inArray(updateRequests.status, ["new", "in_progress"])),
    );
  const [dataRequests] = await tx
    .select({ count })
    .from(customerDataRequests)
    .where(and(eq(customerDataRequests.tenantId, tenantId), eq(customerDataRequests.status, "new")));
  return {
    team: team.count,
    unavailability: absences.count,
    promotions: activePromotions.count,
    promo: codes.count,
    giftCards: cards.count,
    requests: requests.count,
    customerData: dataRequests.count,
  };
}
