import "server-only";
import { env } from "@/config/env";
import type { PlaceReviews, ReviewsProvider } from "@/modules/reviews/google";

/**
 * Service officiel de Google : « Places API (New) », détail d'une fiche.
 * Seuls les champs utiles sont demandés (note, nombre d'avis, 5 avis, lien) :
 * c'est le masque de champs qui fixe le prix de l'appel.
 */
export function googlePlacesProvider(): ReviewsProvider | null {
  const key = env().GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  return {
    async fetchPlace(placeId, language): Promise<PlaceReviews> {
      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(language)}`;
      const response = await fetch(url, {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Google Places : ${response.status}`);
      const body = (await response.json()) as {
        rating?: number;
        userRatingCount?: number;
        googleMapsUri?: string;
        reviews?: {
          rating?: number;
          text?: { text?: string };
          originalText?: { text?: string };
          relativePublishTimeDescription?: string;
          publishTime?: string;
          authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
        }[];
      };
      return {
        rating: typeof body.rating === "number" ? Math.round(body.rating * 10) / 10 : null,
        total: body.userRatingCount ?? 0,
        url: body.googleMapsUri ?? null,
        reviews: (body.reviews ?? []).map((review) => ({
          author: review.authorAttribution?.displayName ?? "",
          authorUrl: review.authorAttribution?.uri ?? null,
          authorPhotoUrl: review.authorAttribution?.photoUri ?? null,
          rating: review.rating ?? 0,
          text: review.text?.text ?? review.originalText?.text ?? "",
          relativeTime: review.relativePublishTimeDescription ?? "",
          publishedAt: review.publishTime ?? null,
        })),
      };
    },
  };
}
