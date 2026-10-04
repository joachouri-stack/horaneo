import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteData } from "@/modules/site/data";
import { businessPath, SITE_PATHS } from "@/modules/site/paths";
import { PriceTag } from "../PriceTag";
import { SiteImage } from "../SiteImage";
import { PillLink, Tag } from "./ui";

type Site = NonNullable<SiteData>;

/** Les entreprises d'un site qui ont une page (photo, métier, présentation, soins phares). */
export function presentedBusinesses(site: Site) {
  return site.businesses.filter((business) => business.slug && (business.role || business.bio));
}

/** Cartes des professionnelles : photo, métier, trois soins, « Réserver » et « Tous ses soins ». */
export async function ProfessionalCards({
  site,
  businesses,
}: {
  site: Site;
  businesses: ReturnType<typeof presentedBusinesses>;
}) {
  const t = await getTranslations("site.atelier");
  const tSite = await getTranslations("site");
  const money = (cents: number) => formatMoney(cents, site.tenant.currency, site.locale);
  return (
    <ul className={`mt-10 grid gap-6 ${businesses.length > 1 ? "md:grid-cols-2" : ""}`}>
      {businesses.map((business) => {
        const services = site.services.filter((service) => service.businessId === business.id).slice(0, 3);
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
              <h3 className="mt-3 font-site-display text-4xl font-medium">{business.name}</h3>
              {business.role && <p className="mt-1 font-semibold text-site-accent">{business.role}</p>}
              {business.bio && <p className="mt-3 whitespace-pre-line text-site-muted">{business.bio}</p>}
              {services.length > 0 && (
                <ul className="mt-5 divide-y divide-site-border border-y border-site-border text-sm">
                  {services.map((service) => (
                    <li key={service.id} className="flex justify-between gap-4 py-2.5">
                      <span>{service.name}</span>
                      <PriceTag
                        className="font-bold text-site-accent"
                        price={money(service.promo?.priceCents ?? service.priceCents)}
                        was={service.promo ? money(service.promo.referenceCents) : null}
                      />
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <PillLink href={`${SITE_PATHS.booking}?avec=${business.id}`} size="sm">
                  {tSite("book")}
                </PillLink>
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
