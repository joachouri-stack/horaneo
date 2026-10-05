import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClockIcon, PhoneIcon } from "@/components/site/atelier/icons";
import { OpenFromHash } from "@/components/site/atelier/OpenFromHash";
import { ServiceAccordion } from "@/components/site/atelier/ServiceAccordion";
import { PillLink, Tag } from "@/components/site/atelier/ui";
import { GoogleReviewCards, ReviewsSummary } from "@/components/site/GoogleReviews";
import { SiteImage } from "@/components/site/SiteImage";
import { getSite } from "@/lib/site/load";
import { formatPhone } from "@/modules/phone";
import { businessPath } from "@/modules/site/paths";

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
  // Sa propre fiche Google (site à plusieurs entreprises) : ses avis sur sa page.
  const ownReviews = site.reviews.find((item) => item.businessId === business.id) ?? null;
  const cta = siteCta(site, { businessId: business.id });
  const tSite = await getTranslations("site");
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
        {cta && (
          <PillLink href={cta.href} size="lg" className="mt-6 w-full">
            {cta.kind === "book" ? t("bookWith", { name: business.name }) : tSite(ctaLabelKey(cta))}
          </PillLink>
        )}
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
          <ServiceAccordion site={site} businessId={business.id} />
          {!cardFirst && card}
        </div>
        {ownReviews && (
          <section aria-labelledby="avis-pro" className="mt-14">
            <h2 id="avis-pro" className="text-center font-site-display text-3xl font-medium sm:text-4xl">
              {t("testimonialsTitle")}
            </h2>
            <ReviewsSummary reviews={ownReviews} locale={site.locale} className="mt-3" />
            <div className="mt-8">
              <GoogleReviewCards reviews={ownReviews} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
