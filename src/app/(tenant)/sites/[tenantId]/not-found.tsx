import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Page introuvable sur le site d'un client (dans ses couleurs). */
export default async function TenantNotFound() {
  const t = await getTranslations("site");
  return (
    <main id="contenu" className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="font-site-display text-6xl font-semibold text-site-heading">404</p>
      <p className="mt-4 text-lg">{t("notFound")}</p>
      <p className="mt-6">
        <Link href="/" className="font-semibold text-site-accent underline">
          {t("backHome")}
        </Link>
      </p>
    </main>
  );
}
