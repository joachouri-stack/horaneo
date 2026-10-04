import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle, TestimonialList } from "@/components/site/blocks";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({ params }: PageProps<"/sites/[tenantId]/avis">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.testimonials" });
  return {
    title: site.pages.testimonials?.seoTitle || t("title"),
    alternates: { canonical: SITE_PATHS.testimonials },
  };
}

export default async function TestimonialsPage({ params }: PageProps<"/sites/[tenantId]/avis">) {
  const site = await getSite((await params).tenantId);
  requireSection(site, "testimonials");
  const t = await getTranslations("site.testimonials");
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={t("title")} intro={site.pages.testimonials?.texts.intro} />
      <TestimonialList site={site} />
    </main>
  );
}
