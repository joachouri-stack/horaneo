import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";
import { siteCta } from "@/modules/site/cta";
import { businessPath, SITE_PATHS } from "@/modules/site/paths";

/** Bandeau « offre du moment » en haut du site, pendant les promotions en cours. */
export async function OfferBanner({ site }: { site: NonNullable<SiteData> }) {
  if (!site.features.promotions || site.offers.length === 0) return null;
  const t = await getTranslations("site.offers");
  const date = (value: string) =>
    new Intl.DateTimeFormat(site.locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
      new Date(`${value}T12:00:00Z`),
    );
  const atelier = site.tenant.templateKey === "atelier";
  return (
    <div className="bg-site-text px-4 py-2 text-center text-sm text-site-bg">
      {site.offers.slice(0, 2).map((offer, index) => {
        const slug = site.businesses.find((business) => business.id === offer.businessId)?.slug;
        const booking = siteCta(site, { businessId: offer.businessId });
        // Sans réservation en ligne : vers la liste des prestations (prix barrés).
        const href =
          atelier && slug
            ? businessPath(slug)
            : booking?.kind === "book"
              ? SITE_PATHS.booking
              : SITE_PATHS.services;
        return (
          <p key={offer.id} className={index > 0 ? "mt-1" : ""}>
            {t("banner", { title: offer.title, date: date(offer.endsOn) })}{" "}
            <Link href={href} className="font-semibold underline underline-offset-4">
              {t("cta")}
            </Link>
          </p>
        );
      })}
    </div>
  );
}
