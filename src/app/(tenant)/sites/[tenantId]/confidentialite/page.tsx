import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { env } from "@/config/env";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/confidentialite">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.privacy" });
  return { title: t("title"), alternates: { canonical: SITE_PATHS.privacy } };
}

/** Politique de confidentialité du site (modèle à faire valider juridiquement). */
export default async function PrivacyPage({ params }: PageProps<"/sites/[tenantId]/confidentialite">) {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations("site.privacy");
  // Chaque entreprise est responsable du fichier de ses propres clientes.
  const name =
    site.businesses.map((business) => business.legalName || business.name).join(" · ") || site.tenant.name;
  const sections = [
    ["controller", t("controllerText", { name })],
    ["data", t("dataText")],
    ["purpose", t("purposeText")],
    ["processor", t("processorText", { product: env().PRODUCT_NAME })],
    ["retention", t("retentionText")],
    ["rights", t("rightsText", { email: site.tenant.email ?? "none" })],
    ["cookies", t("cookiesText")],
  ] as const;
  return (
    <main id="contenu" className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <PageTitle title={t("title")} />
      {sections.map(([key, text]) => (
        <section key={key}>
          <h2 className="mb-2 text-xl font-semibold text-site-accent">{t(key)}</h2>
          <p>{text}</p>
        </section>
      ))}
    </main>
  );
}
