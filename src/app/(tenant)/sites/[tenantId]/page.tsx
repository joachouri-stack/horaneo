import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AtelierHome } from "@/components/site/atelier/AtelierHome";
import { BookButton } from "@/components/site/BookButton";
import { GalleryGrid, Prose, TestimonialList } from "@/components/site/blocks";
import { AddressBlock, OpeningHoursTable } from "@/components/site/PracticalInfo";
import { ServiceList } from "@/components/site/ServiceList";
import { SiteImage } from "@/components/site/SiteImage";
import { getSite } from "@/lib/site/load";
import { visibleSections } from "@/modules/site/data";
import { SITE_PATHS } from "@/modules/site/paths";

/**
 * Accueil du site. Pack Basic : fiche d'une seule page (présentation,
 * prestations, horaires, adresse). Site complet : accueil avec aperçus.
 */
export default async function TenantHomePage({ params }: PageProps<"/sites/[tenantId]">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const t = await getTranslations("site");
  const home = site.pages.home;
  const cover = home?.photo ?? null;
  const sections = visibleSections(site);
  if (site.tenant.templateKey === "atelier" && site.features.fullSite) return <AtelierHome site={site} />;

  const hero = (
    <section className="relative overflow-hidden">
      {cover && (
        <SiteImage
          image={cover}
          sizes="100vw"
          priority
          className="absolute inset-0 h-full w-full object-cover"
          alt=""
        />
      )}
      <div className={cover ? "relative bg-black/45" : "bg-site-surface"}>
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <h1
            className={`font-site-display text-5xl font-semibold sm:text-6xl ${cover ? "text-white" : "text-site-accent"}`}
          >
            {site.tenant.name}
          </h1>
          {home?.texts.tagline && (
            <p className={`mt-4 max-w-2xl text-xl sm:text-2xl ${cover ? "text-white/95" : "text-site-text"}`}>
              {home.texts.tagline}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <BookButton label={t("book")} size="lg" />
            {site.features.fullSite && sections.services && (
              <Link
                href={SITE_PATHS.services}
                className={`inline-flex min-h-14 items-center rounded-site border px-6 text-lg font-semibold ${cover ? "border-white/70 text-white" : "border-site-border text-site-text"}`}
              >
                {t("home.discover")}
              </Link>
            )}
          </div>
        </div>
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
            <h2 id="prestations" className="mb-6 font-site-display text-3xl font-semibold text-site-accent">
              {t("services.title")}
            </h2>
            <ServiceList
              categories={site.categories}
              uncategorized={site.uncategorized}
              locale={site.locale}
              linkCategories={false}
              headingLevel={3}
            />
          </section>
          <section aria-labelledby="infos" className="grid gap-8 md:grid-cols-2">
            <div className="rounded-site bg-site-surface p-6">
              <h2 id="infos" className="mb-4 font-site-display text-2xl font-semibold text-site-accent">
                {t("practical.hours")}
              </h2>
              <OpeningHoursTable site={site} />
            </div>
            <div className="rounded-site bg-site-surface p-6">
              <AddressBlock site={site} />
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ─── Site complet ──────────────────────────────────────────────────────────
  const featured = site.services.slice(0, 6);
  return (
    <main id="contenu">
      {hero}
      <div className="mx-auto max-w-6xl space-y-16 px-4 py-12">
        {home?.texts.intro && <Prose text={home.texts.intro} />}

        {featured.length > 0 && (
          <section aria-labelledby="a-la-une">
            <h2 id="a-la-une" className="mb-6 font-site-display text-3xl font-semibold text-site-accent">
              {t("home.featured")}
            </h2>
            <ServiceList categories={[]} uncategorized={featured} locale={site.locale} headingLevel={3} />
            {site.services.length > featured.length || site.categories.length > 0 ? (
              <Link
                href={SITE_PATHS.services}
                className="mt-4 inline-block font-semibold text-site-accent underline"
              >
                {t("services.seeAll")} →
              </Link>
            ) : null}
          </section>
        )}

        {sections.gallery && <GalleryGrid site={site} limit={6} />}

        {sections.testimonials && (
          <section aria-labelledby="avis">
            <h2 id="avis" className="mb-6 font-site-display text-3xl font-semibold text-site-accent">
              {t("home.testimonialsTitle")}
            </h2>
            <TestimonialList site={site} limit={3} />
          </section>
        )}

        <section aria-labelledby="infos" className="grid gap-8 md:grid-cols-2">
          <div className="rounded-site bg-site-surface p-6">
            <h2 id="infos" className="mb-4 font-site-display text-2xl font-semibold text-site-accent">
              {t("practical.hours")}
            </h2>
            <OpeningHoursTable site={site} />
          </div>
          <div className="rounded-site bg-site-surface p-6">
            <AddressBlock site={site} />
          </div>
        </section>
      </div>
    </main>
  );
}
