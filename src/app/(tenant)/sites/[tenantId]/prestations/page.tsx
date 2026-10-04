import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { ServiceList } from "@/components/site/ServiceList";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/prestations">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.services" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription", { name: site.tenant.name, city: site.tenant.city ?? "none" }),
    alternates: { canonical: SITE_PATHS.services },
  };
}

/** Toutes les prestations et leurs tarifs, par catégorie. */
export default async function ServicesPage({ params }: PageProps<"/sites/[tenantId]/prestations">) {
  const site = await getSite((await params).tenantId);
  requireSection(site, "services");
  const t = await getTranslations("site.services");
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={t("title")} />
      <ServiceList categories={site.categories} uncategorized={site.uncategorized} locale={site.locale} />
    </main>
  );
}
