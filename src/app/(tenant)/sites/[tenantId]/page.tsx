import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AtelierHome } from "@/components/site/atelier/AtelierHome";
import { GalleryGrid, Prose, TestimonialList } from "@/components/site/blocks";
import { GoogleReviewCards, ReviewsSummary } from "@/components/site/GoogleReviews";
import { AddressBlock, OpeningHoursTable } from "@/components/site/PracticalInfo";
import { ServiceList } from "@/components/site/ServiceList";
import { BookBanner, CategoryCards, HomeHero, TeamCards } from "@/components/site/WellnessHome";
import { getSite } from "@/lib/site/load";
import { siteReviews, visibleSections } from "@/modules/site/data";
import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import { SITE_PATHS } from "@/modules/site/paths";

/**
 * Accueil du site. Pack Basic : fiche d'une seule page (présentation,
 * prestations, horaires, adresse). Site complet : accueil avec aperçus
 * (catégories, galerie, équipe, avis) et bandeau de réservation.
 */
export default async function TenantHomePage({ params }: PageProps<"/sites/[tenantId]">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const t = await getTranslations("site");
  const home = site.pages.home;
  const sections = visibleSections(site);
  const siteCtaTarget = siteCta(site);
  if (site.tenant.templateKey === "atelier" && site.features.fullSite) return <AtelierHome site={site} />;
  const cta = siteCtaTarget ? { href: siteCtaTarget.href, label: t(ctaLabelKey(siteCtaTarget)) } : null;
  const hero = <HomeHero site={site} cta={cta} />;

  const hoursAndAddress = (
    <section aria-labelledby="infos" className="grid gap-6 md:grid-cols-2">
      <div className="rounded-[1.5rem] bg-site-panel p-6 sm:p-8">
        <h2 id="infos" className="mb-4 font-site-display text-2xl font-semibold text-site-heading">
          {t("practical.hours")}
        </h2>
        <OpeningHoursTable site={site} />
      </div>
      <div className="rounded-[1.5rem] bg-site-panel p-6 sm:p-8">
        <AddressBlock site={site} />
      </div>
    </section>
  );

  // ─── Fiche Basic : une seule page ──────────────────────────────────────────
  if (!site.features.fullSite) {
    return (
      <main id="contenu">
        {hero}
        <div className="mx-auto max-w-6xl space-y-12 px-4 py-12">
          {home?.texts.intro && <Prose text={home.texts.intro} />}
          <section aria-labelledby="prestations">
            <h2 id="prestations" className="mb-6 font-site-display text-3xl font-semibold text-site-heading">
              {t("services.title")}
            </h2>
            <ServiceList
              categories={site.categories}
              uncategorized={site.uncategorized}
              locale={site.locale}
              linkCategories={false}
              headingLevel={3}
              popularIds={site.popularServiceIds}
            />
          </section>
          {hoursAndAddress}
        </div>
      </main>
    );
  }

  // ─── Site complet ──────────────────────────────────────────────────────────
  const featured = site.uncategorized.slice(0, 6);
  const reviews = site.features.googleReviews ? siteReviews(site) : null;
  const sectionTitle = "mb-6 font-site-display text-3xl font-semibold text-site-heading sm:text-4xl";
  return (
    <main id="contenu">
      {hero}
      <div className="mx-auto max-w-6xl space-y-20 px-4 py-14">
        {home?.texts.intro && <Prose text={home.texts.intro} />}

        {sections.services && (
          <section aria-labelledby="a-la-une">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="a-la-une" className={sectionTitle}>
                {t("home.featured")}
              </h2>
              <Link href={SITE_PATHS.services} className="mb-6 font-semibold text-site-accent underline">
                {t("services.seeAll")} →
              </Link>
            </div>
            <div className="space-y-6">
              {site.categories.length > 0 && (
                <CategoryCards site={site} categories={site.categories} popularIds={site.popularServiceIds} />
              )}
              {featured.length > 0 && (
                <ServiceList
                  categories={[]}
                  uncategorized={featured}
                  locale={site.locale}
                  headingLevel={3}
                  popularIds={site.popularServiceIds}
                />
              )}
            </div>
          </section>
        )}

        {sections.gallery && <GalleryGrid site={site} limit={6} />}

        {site.staff.length > 0 && (
          <section aria-labelledby="equipe">
            <h2 id="equipe" className={sectionTitle}>
              {t("home.teamTitle")}
            </h2>
            <TeamCards site={site} />
          </section>
        )}

        {sections.testimonials && (
          <section aria-labelledby="avis">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="avis" className={sectionTitle}>
                {t("home.testimonialsTitle")}
              </h2>
              {reviews && <ReviewsSummary reviews={reviews} locale={site.locale} className="mb-6" />}
            </div>
            <div className="space-y-6">
              {site.testimonials.length > 0 && <TestimonialList site={site} limit={3} />}
              {reviews && site.testimonials.length === 0 && <GoogleReviewCards reviews={reviews} />}
            </div>
          </section>
        )}

        <BookBanner site={site} cta={cta} />

        {hoursAndAddress}
      </div>
    </main>
  );
}
