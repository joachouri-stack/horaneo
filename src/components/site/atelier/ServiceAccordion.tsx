import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteData } from "@/modules/site/data";
import { formatDuration } from "@/modules/site/format";
import { detailBlocks } from "@/modules/site/details";
import { categoryPath, SITE_PATHS } from "@/modules/site/paths";
import { PriceTag } from "../PriceTag";
import { ArrowIcon, CheckIcon } from "./icons";
import { PillLink, Tag } from "./ui";
import { OpenFromHash } from "./OpenFromHash";

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
  const own = site.categories.filter((category) => category.businessId === businessId);
  // Les formations ont leur propre page : un simple lien, sans liste de tarifs.
  const categories = own.filter((category) => !category.isTraining);
  const trainings = own.filter((category) => category.isTraining);
  const loose = site.uncategorized.filter((service) => service.businessId === businessId);
  const groups = [
    ...categories.map((category) => ({
      id: category.slug,
      name: category.name,
      details: category.details,
      featured: category.isFeatured,
      services: category.services,
    })),
    ...(loose.length > 0
      ? [
          {
            id: `autres-${businessId.slice(0, 8)}`,
            name: tServices("other"),
            details: "",
            featured: false,
            services: loose,
          },
        ]
      : []),
  ];
  // Catégorie sans réservation en ligne (ex. formations) : « Demander des informations ».
  const business = site.businesses.find((item) => item.id === businessId);
  const contactHref = business?.phone
    ? `tel:${business.phone}`
    : (business?.email ?? site.tenant.email)
      ? `mailto:${business?.email ?? site.tenant.email}`
      : null;
  const duration = (minutes: number) =>
    formatDuration((key, values) => tServices(key as "durationMinutes", values), minutes);

  return (
    <div className="space-y-3">
      <OpenFromHash />
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
          {group.details && <CategoryDetails text={group.details} />}
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
          {contactHref && group.services.length > 0 && !group.services.some((s) => s.bookOnline) && (
            <div className="px-5 pb-5 sm:px-6">
              <PillLink href={contactHref} size="sm">
                {t("askInfo")}
              </PillLink>
            </div>
          )}
        </details>
      ))}
      {trainings.map((category) => (
        <Link
          key={category.id}
          id={category.slug}
          href={categoryPath(category.slug)}
          className="group flex scroll-mt-28 items-center gap-4 rounded-[1.5rem] border border-site-border bg-site-card px-5 py-4 transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)] sm:px-6"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-site-display text-2xl font-medium sm:text-[1.7rem]">
              {category.name}
            </span>
            {category.description && (
              <span className="block text-sm text-site-muted">{category.description}</span>
            )}
          </span>
          <span className="hidden text-sm font-semibold text-site-accent sm:inline">{t("seeTraining")}</span>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-site-button text-site-on-button"
          >
            <ArrowIcon />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Présentation d'une catégorie : paragraphes, et les lignes « - … » en liste cochée. */
function CategoryDetails({ text }: { text: string }) {
  const blocks = detailBlocks(text);
  return (
    <div className="mx-5 mb-2 space-y-3 rounded-2xl bg-site-surface p-4 sm:mx-6 sm:p-5">
      {blocks.map((block, index) =>
        block.kind === "p" ? (
          <p key={index} className="text-site-muted">
            {block.text}
          </p>
        ) : (
          <ul key={index} className="grid gap-2 sm:grid-cols-2">
            {block.items.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-site-button text-site-on-button">
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
