import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { businesses, googleReviews, plans, tenants, type CachedReview, type PlanFeatures } from "@/db/schema";

/**
 * Avis Google d'une entreprise (fiche Google renseignée par l'administratrice).
 * Relus une fois par jour par la tâche planifiée, jamais recopiés ni modifiés :
 * le site affiche cette copie, avec le lien vers tous les avis. Si Google ne
 * répond pas, la dernière copie reste affichée 30 jours au plus.
 */

export type PlaceReviews = {
  rating: number | null;
  total: number;
  url: string | null;
  reviews: CachedReview[];
};

/** Le service de Google (implémentation réelle : src/lib/reviews/google-places.ts ; faux en test). */
export interface ReviewsProvider {
  fetchPlace(placeId: string, language: string): Promise<PlaceReviews>;
}

export const REFRESH_HOURS = 24;
export const MAX_AGE_DAYS = 30;

/** Copie encore affichable (relue depuis moins de 30 jours). */
export function isDisplayable(fetchedAt: Date | null, now = new Date()) {
  return Boolean(fetchedAt && now.getTime() - fetchedAt.getTime() < MAX_AGE_DAYS * 86_400_000);
}

/** Lien vers les avis d'une fiche, même sans copie (aucun appel à Google). */
export function placeReviewsUrl(placeId: string) {
  return `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`;
}

/**
 * Relit les fiches dont la copie a plus de 24 h (ou dont la fiche a changé),
 * pour les sites en ligne dont le pack inclut les avis. Rôle plateforme.
 */
export async function refreshGoogleReviews(
  tx: Transaction,
  provider: ReviewsProvider | null,
  now = new Date(),
  limit = 25,
) {
  if (!provider) return { refreshed: 0, failed: 0 };
  const due = await tx
    .select({
      businessId: businesses.id,
      tenantId: businesses.tenantId,
      placeId: businesses.googlePlaceId,
      locale: tenants.defaultLocale,
      features: plans.features,
    })
    .from(businesses)
    .innerJoin(tenants, eq(tenants.id, businesses.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .leftJoin(googleReviews, eq(googleReviews.businessId, businesses.id))
    .where(
      and(
        isNotNull(businesses.googlePlaceId),
        eq(tenants.status, "active"),
        sql`(${googleReviews.fetchedAt} IS NULL
             OR ${googleReviews.placeId} IS DISTINCT FROM ${businesses.googlePlaceId}
             OR ${googleReviews.updatedAt} < ${new Date(now.getTime() - REFRESH_HOURS * 3_600_000).toISOString()}::timestamptz)`,
      ),
    )
    .limit(limit);
  let refreshed = 0;
  let failed = 0;
  for (const row of due) {
    if (!(row.features as PlanFeatures).googleReviews || !row.placeId) continue;
    try {
      const place = await provider.fetchPlace(row.placeId, row.locale);
      await tx
        .insert(googleReviews)
        .values({
          businessId: row.businessId,
          tenantId: row.tenantId,
          placeId: row.placeId,
          rating: place.rating,
          total: place.total,
          reviews: place.reviews.slice(0, 5),
          url: place.url,
          fetchedAt: now,
          lastError: null,
        })
        .onConflictDoUpdate({
          target: googleReviews.businessId,
          set: {
            placeId: row.placeId,
            rating: place.rating,
            total: place.total,
            reviews: place.reviews.slice(0, 5),
            url: place.url,
            fetchedAt: now,
            lastError: null,
            updatedAt: now,
          },
        });
      refreshed += 1;
    } catch (error) {
      // La dernière copie reste affichée ; nouvel essai au prochain passage quotidien.
      const message = error instanceof Error ? error.message.slice(0, 300) : "erreur";
      await tx
        .insert(googleReviews)
        .values({
          businessId: row.businessId,
          tenantId: row.tenantId,
          placeId: row.placeId,
          lastError: message,
        })
        .onConflictDoUpdate({
          target: googleReviews.businessId,
          set: { lastError: message, updatedAt: now },
        });
      failed += 1;
    }
  }
  return { refreshed, failed };
}
