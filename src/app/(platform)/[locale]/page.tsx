import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";

/**
 * Page d'accueil provisoire du site commercial.
 * La version complète (visuel de réservation, packs, FAQ…) arrive à l'étape 11.
 */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const product = env().PRODUCT_NAME;

  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" aria-label={t("common.homeLink", { product })}>
          <Logo productName={product} className="text-2xl" />
        </Link>
        <nav className="flex items-center gap-4">
          <LanguageSwitcher />
          <Link href="/" className="font-semibold text-navy hover:underline">
            {t("common.login")}
          </Link>
        </nav>
      </header>

      <main id="contenu" className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">{t("home.title")}</h1>
        <p className="mt-6 max-w-2xl text-lg">{t("home.subtitle")}</p>
        <Link
          href="/"
          className="mt-10 inline-block rounded-[var(--radius-card)] bg-coral px-6 py-3 text-lg font-bold text-white hover:bg-coral-dark"
        >
          {t("home.cta")}
        </Link>
      </main>
    </>
  );
}
