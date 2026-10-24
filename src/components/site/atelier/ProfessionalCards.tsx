import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";
import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import { businessPath } from "@/modules/site/paths";
import { Stars } from "../GoogleReviews";
import { SiteImage } from "../SiteImage";
import { BusinessShop } from "./BusinessShop";
import { PillLink, Tag } from "./ui";

type Site = NonNullable<SiteData>;

/** Les entreprises d'un site qui ont une page (photo, métier, présentation, soins phares). */
export function presentedBusinesses(site: Site) {
  return site.businesses.filter((business) => business.slug && (business.role || business.bio));
}

/** Cartes des professionnelles : photo, métier, présentation, sa phrase, ses avis Google, « Réserver » et « Tous ses soins ». */
export async function ProfessionalCards({
  site,
  businesses,
}: {
  site: Site;
  businesses: ReturnType<typeof presentedBusinesses>;
}) {
  const t = await getTranslations("site.atelier");
  const tSite = await getTranslations("site");
  return (
    <ul className={`mt-10 grid gap-6 ${businesses.length > 1 ? "md:grid-cols-2" : ""}`}>
      {businesses.map((business) => {
        const cta = siteCta(site, { businessId: business.id });
        const reviews = site.reviews.find((item) => item.businessId === business.id);
        return (
          <li
            key={business.id}
            className="group overflow-hidden rounded-[1.75rem] border border-site-border bg-site-bg transition-shadow duration-300 hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)]"
          >
            {business.photo && (
              <SiteImage
                image={business.photo}
                alt={business.photo.alt}
                sizes="(min-width: 768px) 45vw, 100vw"
                className="aspect-[16/10] w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            )}
            <div className="p-6 sm:p-8">
              {business.title && <Tag>{business.title}</Tag>}
              <BusinessShop business={business} className="mt-4" />
              <h3 className="mt-3 font-site-display text-4xl font-medium">{business.name}</h3>
              {business.role && <p className="mt-1 font-semibold text-site-accent">{business.role}</p>}
              {business.bio && <p className="mt-3 whitespace-pre-line text-site-muted">{business.bio}</p>}
              {business.quote && (
                <figure className="relative mt-6 rounded-[1.25rem] bg-site-card px-5 pb-5 pt-7">
                  <span
                    aria-hidden="true"
                    className="absolute -top-3 left-5 flex h-8 w-8 items-center justify-center rounded-full bg-site-button font-site-display text-2xl leading-none text-site-on-button"
                  >
                    “
                  </span>
                  <blockquote className="font-site-display text-lg italic leading-snug text-site-text">
                    {business.quote}
                  </blockquote>
                  <figcaption className="mt-3 text-sm font-semibold text-site-accent">
                    — {business.name}
                  </figcaption>
                </figure>
              )}
              {reviews && <BusinessReviews reviews={reviews} locale={site.locale} />}
              <div className="mt-6 flex flex-wrap gap-3">
                {cta && (
                  <PillLink href={cta.href} size="sm">
                    {tSite(ctaLabelKey(cta))}
                  </PillLink>
                )}
                <PillLink href={businessPath(business.slug!)} variant="outline" size="sm">
                  {t("allTheirServices")}
                </PillLink>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Avis Google de la professionnelle : note, nombre d'avis et un extrait (tel que Google le fournit). */
async function BusinessReviews({ reviews, locale }: { reviews: Site["reviews"][number]; locale: string }) {
  const t = await getTranslations("site.reviews");
  const link = "font-semibold underline underline-offset-4 hover:opacity-80";
  if (reviews.rating === null) {
    return (
      <p className="mt-5 text-sm">
        <a href={reviews.url} target="_blank" rel="noopener noreferrer" className={link}>
          {t("seeOnGoogle")} ↗
        </a>
      </p>
    );
  }
  const rating = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    reviews.rating,
  );
  const excerpt = reviews.reviews[0];
  return (
    <div className="mt-5 border-t border-site-border pt-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Stars rating={reviews.rating} className="text-base" />
        <span className="font-semibold">{t("summary", { rating, count: reviews.total })}</span>
        <a href={reviews.url} target="_blank" rel="noopener noreferrer" className={link}>
          {t("readAll")} ↗
        </a>
      </p>
      {excerpt && (
        <figure className="mt-3">
          <blockquote className="line-clamp-3 text-sm text-site-muted">« {excerpt.text} »</blockquote>
          <figcaption className="mt-1 text-xs text-site-muted">
            {excerpt.author} · {excerpt.relativeTime} · {t("google")}
          </figcaption>
        </figure>
      )}
    </div>
  );
}
