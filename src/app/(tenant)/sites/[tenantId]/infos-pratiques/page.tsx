import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { AddressBlock, OpeningHoursTable } from "@/components/site/PracticalInfo";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/infos-pratiques">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.practical" });
  return {
    title: site.pages.practical?.seoTitle || t("title"),
    description:
      site.pages.practical?.seoDescription ||
      [site.tenant.address, site.tenant.city].filter(Boolean).join(", ") ||
      undefined,
    alternates: { canonical: SITE_PATHS.practical },
  };
}

/** Horaires, adresse, plan, téléphone, accès. */
export default async function PracticalPage({ params }: PageProps<"/sites/[tenantId]/infos-pratiques">) {
  const site = await getSite((await params).tenantId);
  requireSection(site, "practical");
  const t = await getTranslations("site.practical");
  const access = site.pages.practical?.texts.access;
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={t("title")} />
      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="horaires" className="rounded-site bg-site-panel p-6">
          <h2 id="horaires" className="mb-4 font-site-display text-2xl font-semibold text-site-heading">
            {t("hours")}
          </h2>
          <OpeningHoursTable site={site} />
        </section>
        <section className="space-y-6 rounded-site bg-site-panel p-6">
          <AddressBlock site={site} showMap />
          {access && (
            <div>
              <h3 className="font-semibold text-site-text">{t("access")}</h3>
              <p className="mt-1 whitespace-pre-line text-site-muted">{access}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
