import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { getSite } from "@/lib/site/load";
import { formatPhone } from "@/modules/phone";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/reserver">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.booking" });
  return { title: t("title"), alternates: { canonical: SITE_PATHS.booking }, robots: { index: false } };
}

/** Réservation (provisoire) : le parcours en 4 étapes arrive à l'étape 6. */
export default async function BookingPage({ params }: PageProps<"/sites/[tenantId]/reserver">) {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations("site.booking");
  return (
    <main id="contenu" className="mx-auto max-w-2xl px-4 py-12">
      <PageTitle title={t("title")} intro={t("soon")} />
      {site.tenant.phone ? (
        <p className="text-lg">
          {t("callUs")}{" "}
          <a href={`tel:${site.tenant.phone}`} className="font-semibold text-site-accent underline">
            {formatPhone(site.tenant.phone)}
          </a>
        </p>
      ) : (
        <p className="text-lg">{t("noPhone")}</p>
      )}
    </main>
  );
}
