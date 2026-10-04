import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowIcon, ClockIcon, PhoneIcon } from "@/components/site/atelier/icons";
import { OpenFromHash } from "@/components/site/atelier/OpenFromHash";
import { PillLink, Tag } from "@/components/site/atelier/ui";
import { SiteImage } from "@/components/site/SiteImage";
import { getSite } from "@/lib/site/load";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/modules/phone";
import { formatDuration } from "@/modules/site/format";
import { businessPath, SITE_PATHS } from "@/modules/site/paths";

async function load(params: PageProps<"/sites/[tenantId]/avec/[slug]">["params"]) {
  const { tenantId, slug } = await params;
  const site = await getSite(tenantId);
  const index = site.businesses.findIndex((business) => business.slug === slug);
  if (index < 0 || !site.features.fullSite) notFound();
  return { site, business: site.businesses[index], index };
}

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/avec/[slug]">): Promise<Metadata> {
  const { site, business } = await load(params);
  const title = business.title ? `${business.title} · ${business.name}` : business.name;
  return {
    title,
    description: [business.role, business.bio].filter(Boolean).join(" — ").slice(0, 160) || undefined,
    alternates: { canonical: businessPath(business.slug!) },
    openGraph: { siteName: site.tenant.name, title },
  };
}

/** Page d'une professionnelle : sa présentation, ses soins par catégorie, « Réserver avec … ». */
export default async function BusinessPage({ params }: PageProps<"/sites/[tenantId]/avec/[slug]">) {
  const { site, business, index } = await load(params);
  const t = await getTranslations("site.atelier");
  const tServices = await getTranslations("site.services");
  const categories = site.categories.filter((category) => category.businessId === business.id);
  const loose = site.uncategorized.filter((service) => service.businessId === business.id);
  const groups = [
    ...categories.map((category) => ({
      id: category.slug,
      name: category.name,
      featured: category.isFeatured,
      services: category.services,
    })),
    ...(loose.length > 0
      ? [{ id: "autres", name: tServices("other"), featured: false, services: loose }]
      : []),
  ];
  const duration = (minutes: number) =>
    formatDuration((key, values) => tServices(key as "durationMinutes", values), minutes);
  const bookHref = `${SITE_PATHS.booking}?avec=${business.id}`;
  const cardFirst = index % 2 === 0;

  const card = (
    <aside className="overflow-hidden rounded-[1.75rem] border border-site-border bg-site-card lg:sticky lg:top-28">
      {business.photo && (
        <SiteImage
          image={business.photo}
          alt={business.photo.alt}
          sizes="(min-width: 1024px) 40vw, 100vw"
          priority
          className="aspect-[16/10] w-full object-cover"
        />
      )}
      <div className="p-6 sm:p-8">
        <h2 className="font-site-display text-4xl font-medium">{business.name}</h2>
        {business.role && <p className="mt-1 font-semibold text-site-accent">{business.role}</p>}
        {business.bio && (
          <p className="mt-4 whitespace-pre-line leading-relaxed text-site-muted">{business.bio}</p>
        )}
        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <ClockIcon className="h-4 w-4 text-site-accent" />
            {business.availability || t("byAppointment")}
          </li>
          {business.phone && (
            <li className="flex items-center gap-2">
              <PhoneIcon className="h-4 w-4 text-site-accent" />
              <a href={`tel:${business.phone}`} className="font-semibold underline underline-offset-4">
                {formatPhone(business.phone, site.tenant.country)}
              </a>
            </li>
          )}
        </ul>
        <PillLink href={bookHref} size="lg" className="mt-6 w-full">
          {t("bookWith", { name: business.name })}
        </PillLink>
      </div>
    </aside>
  );

  return (
    <main id="contenu" className={index % 2 === 1 ? "bg-site-surface" : ""}>
      <OpenFromHash />
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-10 sm:px-8 sm:pt-14">
        <Tag tone={index % 2 === 1 ? "card" : "soft"}>{t("withName", { name: business.name })}</Tag>
        <h1 className="mt-4 font-site-display text-5xl font-medium sm:text-6xl">
          {business.title || business.name}
        </h1>
        <p className="mt-3 max-w-xl text-lg text-site-muted">{t("pageIntro")}</p>

        <div
          className={`mt-10 grid items-start gap-6 lg:gap-8 ${cardFirst ? "lg:grid-cols-[0.8fr_1.2fr]" : "lg:grid-cols-[1.2fr_0.8fr]"}`}
        >
          {cardFirst && card}
          <div className="space-y-3">
            {groups.map((group, position) => (
              <details
                key={group.id}
                id={group.id}
                open={position === 0}
                className="group scroll-mt-28 rounded-[1.5rem] border border-site-border bg-site-card open:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.15)]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span className="flex flex-1 flex-wrap items-center gap-3">
                    <span className="font-site-display text-2xl font-medium sm:text-[1.7rem]">
                      {group.name}
                    </span>
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
                <ul className="px-5 pb-4 sm:px-6">
                  {group.services.map((service) => {
                    const price = formatMoney(service.priceCents, service.currency, site.locale);
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
                          {service.priceFrom ? tServices("priceFrom", { price }) : price}
                        </span>
                        {service.isOnlineBookable ? (
                          <Link
                            href={`${SITE_PATHS.booking}?prestation=${service.id}`}
                            aria-label={t("bookService", { service: service.name })}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-site-surface text-site-accent hover:bg-site-button hover:text-site-on-button"
                          >
                            <ArrowIcon />
                          </Link>
                        ) : (
                          <span className="w-9 shrink-0 text-center text-xs text-site-muted">
                            {t("onRequest")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
          {!cardFirst && card}
        </div>
      </div>
    </main>
  );
}
