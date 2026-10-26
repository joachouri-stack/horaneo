import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteCategory, SiteService } from "@/modules/site/data";
import { formatDuration } from "@/modules/site/format";
import { categoryPath } from "@/modules/site/paths";
import { BookButton } from "./BookButton";
import { PriceTag } from "./PriceTag";

/** Une prestation : nom, durée, prix et bouton « Réserver ». */
async function ServiceRow({
  service,
  locale,
  popular,
}: {
  service: SiteService;
  locale: string;
  popular: boolean;
}) {
  const t = await getTranslations("site");
  const tServices = await getTranslations("site.services");
  const tOffers = await getTranslations("site.offers");
  const price = formatMoney(service.promo?.priceCents ?? service.priceCents, service.currency, locale);
  const was = service.promo ? formatMoney(service.promo.referenceCents, service.currency, locale) : null;
  return (
    <li className="flex flex-col gap-3 border-b border-site-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-site-text">
          {service.name}
          {popular && (
            <span className="rounded-full bg-site-accent px-2 py-px text-xs font-semibold text-site-on-button">
              {t("home.popular")}
            </span>
          )}
        </h3>
        {service.description && <p className="mt-1 text-site-muted">{service.description}</p>}
        <p className="mt-1 text-site-muted">
          {formatDuration(
            (key, values) => tServices(key as "durationMinutes", values),
            service.durationMinutes,
          )}
          {" · "}
          <span className="font-semibold text-site-text">
            <PriceTag
              price={service.priceFrom ? tServices("priceFrom", { price }) : price}
              was={was}
              wasLabel={was ? tOffers("was", { price: was }) : undefined}
            />
          </span>
        </p>
      </div>
      {service.bookOnline && (
        <BookButton
          label={t("book")}
          ariaLabel={t("bookService", { service: service.name })}
          serviceId={service.id}
          size="sm"
          className="self-start sm:self-center"
        />
      )}
    </li>
  );
}

/** Prestations regroupées par catégorie (avec lien vers la page de chaque catégorie). */
export async function ServiceList({
  categories,
  uncategorized,
  locale,
  linkCategories = true,
  headingLevel = 2,
  popularIds = [],
}: {
  categories: SiteCategory[];
  uncategorized: SiteService[];
  locale: string;
  linkCategories?: boolean;
  headingLevel?: 2 | 3;
  /** Prestations les plus réservées : étiquette « Populaire ». */
  popularIds?: string[];
}) {
  const t = await getTranslations("site.services");
  const Heading = headingLevel === 2 ? "h2" : "h3";
  if (categories.length === 0 && uncategorized.length === 0)
    return <p className="text-site-muted">{t("empty")}</p>;
  return (
    <div className="space-y-8">
      {categories.map((category) => (
        <section
          key={category.id}
          aria-labelledby={`cat-${category.id}`}
          className="rounded-site bg-site-panel p-5 sm:p-6"
        >
          <Heading
            id={`cat-${category.id}`}
            className="font-site-display text-2xl font-semibold text-site-heading"
          >
            {linkCategories ? (
              <Link href={categoryPath(category.slug)} className="hover:underline">
                {category.name}
              </Link>
            ) : (
              category.name
            )}
          </Heading>
          {category.description && <p className="mt-2 text-site-muted">{category.description}</p>}
          <ul className="mt-2">
            {category.services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                locale={locale}
                popular={popularIds.includes(service.id)}
              />
            ))}
          </ul>
        </section>
      ))}
      {uncategorized.length > 0 && (
        <section aria-labelledby="cat-other" className="rounded-site bg-site-panel p-5 sm:p-6">
          {categories.length > 0 && (
            <Heading id="cat-other" className="font-site-display text-2xl font-semibold text-site-heading">
              {t("other")}
            </Heading>
          )}
          <ul className="mt-2">
            {uncategorized.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                locale={locale}
                popular={popularIds.includes(service.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
