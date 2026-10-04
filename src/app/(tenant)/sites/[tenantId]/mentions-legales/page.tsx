import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { env } from "@/config/env";
import { withTenant } from "@/db/access";
import { getSite } from "@/lib/site/load";
import { formatPhone } from "@/modules/phone";
import { getPlatformSetting } from "@/modules/settings";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/mentions-legales">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.legal" });
  return { title: t("title"), alternates: { canonical: SITE_PATHS.legal } };
}

/**
 * Mentions légales générées à partir des coordonnées du client. C'est le seul
 * endroit d'un site payant où apparaît le nom du SaaS (en tant qu'hébergeur).
 */
export default async function LegalPage({ params }: PageProps<"/sites/[tenantId]/mentions-legales">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const t = await getTranslations("site.legal");
  const infrastructure = await withTenant(tenantId, (tx) => getPlatformSetting(tx, "legal_infrastructure"));
  const { tenant } = site;
  const config = env();
  const address = [tenant.address, [tenant.postalCode, tenant.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const extra = site.pages.legal?.texts.extra;

  return (
    <main id="contenu" className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <PageTitle title={t("title")} />
      {/* Une entrée par entreprise du site (ex. deux indépendantes sous une même enseigne). */}
      <section>
        <h2 className="mb-2 text-xl font-semibold text-site-accent">
          {site.businesses.length > 1 ? t("publishers") : t("publisher")}
        </h2>
        <div className="space-y-6">
          {site.businesses.map((business) => (
            <ul key={business.id} className="space-y-1">
              <li className="font-semibold">
                {t("publisherName", { name: business.legalName || business.name })}
              </li>
              {business.legalName && business.legalName !== business.name && <li>{business.name}</li>}
              {business.siret && <li>{t("siret", { siret: business.siret })}</li>}
              {business.vatNumber && <li>{t("vat", { vat: business.vatNumber })}</li>}
              {(business.address || address) && (
                <li>{t("address", { address: business.address || address })}</li>
              )}
              {(business.phone ?? tenant.phone) && (
                <li>{t("phone", { phone: formatPhone(business.phone ?? tenant.phone) })}</li>
              )}
              {(business.email ?? tenant.email) && (
                <li>{t("email", { email: (business.email ?? tenant.email)! })}</li>
              )}
            </ul>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-semibold text-site-accent">{t("host")}</h2>
        <p>{t("hostText", { product: config.PRODUCT_NAME, domain: config.MAIN_DOMAIN })}</p>
        <p className="mt-2">
          {t("infrastructure")} : {infrastructure}
        </p>
      </section>
      <section>
        <h2 className="mb-2 text-xl font-semibold text-site-accent">{t("intellectual")}</h2>
        <p>{t("intellectualText", { name: tenant.name })}</p>
      </section>
      {extra && <p className="whitespace-pre-line">{extra}</p>}
    </main>
  );
}
