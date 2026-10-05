import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAV = [
  { hash: "etapes", key: "how" },
  { hash: "tarifs", key: "pricing" },
  { hash: "questions", key: "questions" },
] as const;

const LINK = "inline-flex min-h-11 items-center transition-colors hover:text-brick";

/**
 * En-tête du site commercial (maquette validée) : logo à gauche ; à droite,
 * les liens vers les sections de l'accueil (masqués sur téléphone), la langue
 * et la connexion. Un contenu fourni à droite remplace la connexion.
 */
export async function PlatformHeader({ children }: { children?: React.ReactNode }) {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const product = env().PRODUCT_NAME;
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>
      <header className="mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label={t("common.homeLink", { product })}>
          <Logo productName={product} className="text-[1.8rem]" />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-7 font-medium text-night">
          {!children &&
            NAV.map((item) => (
              <Link
                key={item.hash}
                href={{ pathname: "/", hash: item.hash }}
                className={`${LINK} max-[680px]:hidden`}
              >
                {t(`home.nav.${item.key}`)}
              </Link>
            ))}
          {routing.locales.length > 1 ? (
            <LanguageSwitcher />
          ) : (
            <span className="uppercase" title={t(`languages.${locale as "fr"}`)}>
              {locale}
            </span>
          )}
          {children ?? (
            <Link href="/connexion" className={LINK}>
              {t("common.login")}
            </Link>
          )}
        </nav>
      </header>
    </>
  );
}
