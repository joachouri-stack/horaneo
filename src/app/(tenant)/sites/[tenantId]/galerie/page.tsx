import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GalleryGrid, PageTitle } from "@/components/site/blocks";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/galerie">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.gallery" });
  return { title: site.pages.gallery?.seoTitle || t("title"), alternates: { canonical: SITE_PATHS.gallery } };
}

export default async function GalleryPage({ params }: PageProps<"/sites/[tenantId]/galerie">) {
  const site = await getSite((await params).tenantId);
  requireSection(site, "gallery");
  const t = await getTranslations("site.gallery");
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={t("title")} intro={site.pages.gallery?.texts.intro} />
      <GalleryGrid site={site} />
    </main>
  );
}
