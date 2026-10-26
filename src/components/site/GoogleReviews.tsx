import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";

type Reviews = NonNullable<SiteData>["reviews"][number];

/** Étoiles pleines arrondies à la demie inférieure (affichage seulement). */
export function Stars({ rating, className = "" }: { rating: number; className?: string }) {
  const full = Math.round(rating);
  return (
    <span aria-hidden="true" className={`tracking-tight text-[#d9a441] ${className}`}>
      {"★".repeat(full)}
      <span className="opacity-30">{"★".repeat(5 - full)}</span>
    </span>
  );
}

/** Résumé : « ★★★★★ 4,9 sur 5 · 88 avis Google — Lire tous les avis ». */
export async function ReviewsSummary({
  reviews,
  locale,
  className = "",
}: {
  reviews: Reviews;
  locale: string;
  className?: string;
}) {
  const t = await getTranslations("site.reviews");
  if (reviews.rating === null) {
    return (
      <p className={className}>
        <a
          href={reviews.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          {t("seeOnGoogle")} ↗
        </a>
      </p>
    );
  }
  const rating = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    reviews.rating,
  );
  return (
    <p className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm ${className}`}>
      <Stars rating={reviews.rating} />
      <span>{t("summary", { rating, count: reviews.total })}</span>
      <a
        href={reviews.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
      >
        {t("readAll")} ↗
      </a>
    </p>
  );
}

/**
 * Avis Google, tels que Google les fournit (jamais modifiés), avec leur auteur
 * et leur origine. Les témoignages saisis à la main s'affichent à part.
 */
export async function GoogleReviewCards({ reviews }: { reviews: Reviews }) {
  const t = await getTranslations("site.reviews");
  if (reviews.reviews.length === 0) return null;
  return (
    <ul className="relative flex snap-x gap-5 overflow-x-auto pb-4">
      {reviews.reviews.map((review, index) => (
        <li key={`${review.author}-${index}`} className="w-[85%] shrink-0 snap-start sm:w-[23rem]">
          <figure className="flex h-full flex-col rounded-[1.5rem] bg-site-card p-6">
            <span aria-hidden="true" className="font-site-display text-4xl leading-none text-site-accent">
              “
            </span>
            <blockquote className="mt-2 line-clamp-6 flex-1 whitespace-pre-line">{review.text}</blockquote>
            <figcaption className="mt-4 flex items-center gap-3 text-sm">
              {review.authorPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={review.authorPhotoUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="min-w-0">
                <span className="block font-semibold">
                  {review.authorUrl ? (
                    <a
                      href={review.authorUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {review.author}
                    </a>
                  ) : (
                    review.author
                  )}
                </span>
                <span className="block text-site-muted">
                  <Stars rating={review.rating} className="mr-1" />
                  <span className="sr-only">{t("rating", { rating: review.rating })}</span>
                  {review.relativeTime} · {t("google")}
                </span>
              </span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
