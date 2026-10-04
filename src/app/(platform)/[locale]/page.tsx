import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";

/**
 * Page d'accueil provisoire du site commercial.
 * La version complète (visuel de réservation, packs, FAQ…) arrive à l'étape 11.
 */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  setRequestLocale(resolveLocale((await params).locale));
  const t = await getTranslations();

  return (
    <>
      <PlatformHeader />

      <main id="contenu" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">{t("home.title")}</h1>
        <p className="mt-6 max-w-2xl text-lg">{t("home.subtitle")}</p>
        <Link
          href="/connexion"
          className="mt-10 inline-block rounded-[var(--radius-card)] bg-coral px-6 py-3 text-lg font-bold text-white hover:bg-coral-dark"
        >
          {t("home.cta")}
        </Link>
      </main>
    </>
  );
}
