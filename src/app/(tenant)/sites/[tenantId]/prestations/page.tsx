import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { ServiceAccordion } from "@/components/site/atelier/ServiceAccordion";
import { PillLink, SectionTitle } from "@/components/site/atelier/ui";
import { ServiceList } from "@/components/site/ServiceList";
import { isAtelier } from "@/modules/site/data";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { businessPath, SITE_PATHS } from "@/modules/site/paths";

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

  if (isAtelier(site)) {
    const tAtelier = await getTranslations("site.atelier");
    const withServices = site.businesses.filter((business) =>
      site.services.some((service) => service.businessId === business.id),
    );
    return (
      <main id="contenu" className="mx-auto max-w-5xl space-y-14 px-4 py-14 sm:px-8">
        <div>
          <SectionTitle as="h1" start={t("title")} />
          <p className="mt-3 max-w-xl text-lg text-site-muted">{tAtelier("pageIntro")}</p>
        </div>
        {withServices.map((business) => (
          <section key={business.id} aria-labelledby={`pro-${business.id}`} className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id={`pro-${business.id}`} className="font-site-display text-3xl font-medium sm:text-4xl">
                {business.title
                  ? tAtelier("businessLink", { title: business.title, name: business.name })
                  : business.name}
              </h2>
              {business.slug && (
                <PillLink href={businessPath(business.slug)} variant="outline" size="sm">
                  {tAtelier("allTheirServices")}
                </PillLink>
              )}
            </div>
            <ServiceAccordion site={site} businessId={business.id} openFirst={false} />
          </section>
        ))}
      </main>
    );
  }

  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={t("title")} />
      <ServiceList categories={site.categories} uncategorized={site.uncategorized} locale={site.locale} />
    </main>
  );
}
