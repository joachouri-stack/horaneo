import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle, Prose, TeamGrid } from "@/components/site/blocks";
import { presentedBusinesses, ProfessionalCards } from "@/components/site/atelier/ProfessionalCards";
import { InstitutePhotos } from "@/components/site/atelier/InstitutePhotos";
import { PillLink, SectionTitle } from "@/components/site/atelier/ui";
import { SiteImage } from "@/components/site/SiteImage";
import { institutePhotos, isAtelier } from "@/modules/site/data";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/etablissement">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.about" });
  const page = site.pages.about;
  return {
    title: page?.seoTitle || page?.texts.title || t("title"),
    description: page?.seoDescription || page?.texts.body?.slice(0, 160) || undefined,
    alternates: { canonical: SITE_PATHS.about },
  };
}

/** L'établissement et l'équipe. */
export default async function AboutPage({ params }: PageProps<"/sites/[tenantId]/etablissement">) {
  const site = await getSite((await params).tenantId);
  requireSection(site, "about");
  const t = await getTranslations("site.about");
  const page = site.pages.about;
  const teamIntro = site.pages.team?.texts.intro;

  if (isAtelier(site)) {
    const tAtelier = await getTranslations("site.atelier");
    const tSite = await getTranslations("site");
    const cta = siteCta(site);
    const presented = presentedBusinesses(site);
    return (
      <main id="contenu">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-8 lg:grid-cols-2">
          <div>
            <SectionTitle as="h1" start={page?.texts.title || tAtelier("aboutTitle")} />
            {page?.texts.body && (
              <p className="mt-6 whitespace-pre-line text-lg leading-relaxed text-site-muted">
                {page.texts.body}
              </p>
            )}
            {cta && (
              <PillLink href={cta.href} size="lg" className="mt-8">
                {cta.kind === "book" ? tAtelier("takeAppointment") : tSite(ctaLabelKey(cta))}
              </PillLink>
            )}
          </div>
          <InstitutePhotos photos={institutePhotos(site)} priority />
        </section>
        {presented.length > 0 && (
          <section aria-labelledby="equipe" className="rounded-[2.5rem] bg-site-card py-16">
            <div className="mx-auto max-w-7xl px-4 sm:px-8">
              <SectionTitle
                id="equipe"
                start={tAtelier("teamTitle", { count: presented.length })}
                accent={tAtelier("teamTitleAccent")}
                breakLine
              />
              {teamIntro && <p className="mt-4 max-w-3xl whitespace-pre-line text-site-muted">{teamIntro}</p>}
              <ProfessionalCards site={site} businesses={presented} />
            </div>
          </section>
        )}
        {site.gallery.length > 2 && (
          <section aria-label={tSite("gallery.title")} className="mx-auto max-w-7xl px-4 py-16 sm:px-8">
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {site.gallery.slice(0, 6).map((photo) => (
                <li key={photo.key}>
                  <SiteImage
                    image={photo}
                    sizes="(min-width: 768px) 33vw, 50vw"
                    className="aspect-[4/3] w-full rounded-[1.5rem] object-cover"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    );
  }

  return (
    <main id="contenu" className="mx-auto max-w-6xl space-y-12 px-4 py-12">
      <PageTitle title={page?.texts.title || t("title")} />
      {(page?.texts.body || page?.photo) && (
        <div className="grid items-start gap-8 md:grid-cols-2">
          {page?.texts.body && <Prose text={page.texts.body} />}
          {page?.photo && (
            <SiteImage
              image={page.photo}
              sizes="(min-width: 768px) 50vw, 100vw"
              className="w-full rounded-site object-cover"
            />
          )}
        </div>
      )}
      {site.staff.length > 0 && site.pages.team?.isPublished !== false && (
        <section aria-labelledby="equipe">
          <h2 id="equipe" className="mb-4 font-site-display text-3xl font-semibold text-site-heading">
            {t("teamTitle")}
          </h2>
          {teamIntro && <p className="mb-6 max-w-3xl whitespace-pre-line text-site-muted">{teamIntro}</p>}
          <TeamGrid site={site} />
        </section>
      )}
    </main>
  );
}
