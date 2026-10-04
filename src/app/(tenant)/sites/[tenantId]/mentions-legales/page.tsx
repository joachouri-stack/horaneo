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
      <section>
        <h2 className="mb-2 text-xl font-semibold text-site-accent">{t("publisher")}</h2>
        <ul className="space-y-1">
          <li>{t("publisherName", { name: tenant.legalName || tenant.name })}</li>
          {tenant.siret && <li>{t("siret", { siret: tenant.siret })}</li>}
          {tenant.vatNumber && <li>{t("vat", { vat: tenant.vatNumber })}</li>}
          {address && <li>{t("address", { address })}</li>}
          {tenant.phone && <li>{t("phone", { phone: formatPhone(tenant.phone) })}</li>}
          {tenant.email && <li>{t("email", { email: tenant.email })}</li>}
        </ul>
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
        <p>{t("intellectualText", { name: tenant.legalName || tenant.name })}</p>
      </section>
      {extra && <p className="whitespace-pre-line">{extra}</p>}
    </main>
  );
}
