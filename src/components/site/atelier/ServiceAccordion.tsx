import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteData } from "@/modules/site/data";
import { formatDuration } from "@/modules/site/format";
import { SITE_PATHS } from "@/modules/site/paths";
import { PriceTag } from "../PriceTag";
import { ArrowIcon } from "./icons";
import { Tag } from "./ui";

type Site = NonNullable<SiteData>;

/**
 * Soins d'une entreprise, catégorie par catégorie (volets dépliables, le premier
 * ouvert) : durée, prix et flèche « Réserver » vers le parcours.
 */
export async function ServiceAccordion({
  site,
  businessId,
  openFirst = true,
}: {
  site: Site;
  businessId: string;
  openFirst?: boolean;
}) {
  const t = await getTranslations("site.atelier");
  const tServices = await getTranslations("site.services");
  const tOffers = await getTranslations("site.offers");
  const categories = site.categories.filter((category) => category.businessId === businessId);
  const loose = site.uncategorized.filter((service) => service.businessId === businessId);
  const groups = [
    ...categories.map((category) => ({
      id: category.slug,
      name: category.name,
      featured: category.isFeatured,
      services: category.services,
    })),
    ...(loose.length > 0
      ? [
          {
            id: `autres-${businessId.slice(0, 8)}`,
            name: tServices("other"),
            featured: false,
            services: loose,
          },
        ]
      : []),
  ];
  const duration = (minutes: number) =>
    formatDuration((key, values) => tServices(key as "durationMinutes", values), minutes);

  return (
    <div className="space-y-3">
      {groups.map((group, position) => (
        <details
          key={group.id}
          id={group.id}
          open={openFirst && position === 0}
          className="group scroll-mt-28 rounded-[1.5rem] border border-site-border bg-site-card transition-shadow open:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)]"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-1 flex-wrap items-center gap-3">
              <span className="font-site-display text-2xl font-medium sm:text-[1.7rem]">{group.name}</span>
              {group.featured && <Tag>{t("speciality")}</Tag>}
            </span>
            <span className="hidden text-sm text-site-muted sm:inline">
              {t("servicesCount", { count: group.services.length })}
            </span>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-site-surface text-lg text-site-accent transition group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <ul className="divide-y divide-site-border/60 px-5 pb-3 sm:px-6">
            {group.services.map((service) => {
              const price = formatMoney(
                service.promo?.priceCents ?? service.priceCents,
                service.currency,
                site.locale,
              );
              const was = service.promo
                ? formatMoney(service.promo.referenceCents, service.currency, site.locale)
                : null;
              return (
                <li key={service.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{service.name}</h3>
                    <p className="text-sm text-site-muted">
                      {duration(service.durationMinutes)}
                      {service.description && ` · ${service.description}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-site-accent">
                    <PriceTag
                      price={service.priceFrom ? tServices("priceFrom", { price }) : price}
                      was={was}
                      wasLabel={was ? tOffers("was", { price: was }) : undefined}
                    />
                  </span>
                  {service.bookOnline ? (
                    <Link
                      href={`${SITE_PATHS.booking}?prestation=${service.id}`}
                      aria-label={t("bookService", { service: service.name })}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-site-surface text-site-accent transition hover:bg-site-button hover:text-site-on-button"
                    >
                      <ArrowIcon />
                    </Link>
                  ) : service.isOnlineBookable ? null : (
                    <span className="w-16 shrink-0 text-right text-xs text-site-muted">{t("onRequest")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}
