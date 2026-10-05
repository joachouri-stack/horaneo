import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LinkSignIn } from "@/components/site/account/LinkSignIn";
import { PageTitle } from "@/components/site/blocks";
import { getSite } from "@/lib/site/load";
import { SITE_PATHS } from "@/modules/site/paths";

// Lien personnel : jamais indexé, jamais transmis aux sites externes.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Arrivée par le lien reçu par e-mail : un bouton ouvre l'espace sur cet appareil. */
export default async function CustomerLinkPage({
  params,
  searchParams,
}: PageProps<"/sites/[tenantId]/mes-rendez-vous/connexion">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  if (!site.features.customerSpace) notFound();
  const t = await getTranslations("site.account");
  const token = (await searchParams).jeton;
  return (
    <main id="contenu" className="mx-auto max-w-xl px-4 py-10 sm:py-14">
      <PageTitle
        title={t("linkTitle")}
        intro={typeof token === "string" ? t("linkIntro") : t("linkMissing")}
      />
      {typeof token === "string" ? (
        <LinkSignIn token={token} />
      ) : (
        <Link
          href={SITE_PATHS.account}
          className="font-semibold text-site-accent underline underline-offset-4"
        >
          {t("askAgain")}
        </Link>
      )}
    </main>
  );
}
