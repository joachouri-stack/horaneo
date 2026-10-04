import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle, Prose, TeamGrid } from "@/components/site/blocks";
import { SiteImage } from "@/components/site/SiteImage";
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
          <h2 id="equipe" className="mb-4 font-site-display text-3xl font-semibold text-site-accent">
            {t("teamTitle")}
          </h2>
          {teamIntro && <p className="mb-6 max-w-3xl whitespace-pre-line text-site-muted">{teamIntro}</p>}
          <TeamGrid site={site} />
        </section>
      )}
    </main>
  );
}
