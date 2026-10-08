import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { HeaderShell } from "./HeaderShell";

export const NAV = [
  // Même ordre que l'accueil : les tarifs d'abord.
  { hash: "tarifs", key: "pricing" },
  { hash: "etapes", key: "how" },
  { hash: "fonctions", key: "features" },
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
      <HeaderShell
        menu={
          children
            ? undefined
            : {
                items: NAV.map((item) => ({ hash: item.hash, label: t(`home.nav.${item.key}`) })),
                cta: t("home.cta"),
                open: t("home.nav.menu"),
                close: t("home.nav.closeMenu"),
              }
        }
      >
        <header
          className={`mx-auto flex max-w-[75rem] flex-wrap items-center justify-between gap-3 px-4 py-3 min-[400px]:gap-4 sm:px-6 lg:py-4 ${children ? "" : "max-lg:pr-16"}`}
        >
          <Link href="/" aria-label={t("common.homeLink", { product })}>
            {/* Un peu plus petit sur les très petits téléphones : logo et boutons tiennent sur une ligne. */}
            <Logo productName={product} className="text-[1.5rem] min-[400px]:text-[1.8rem]" />
          </Link>
          <nav className="flex flex-wrap items-center gap-x-3 font-medium text-night min-[400px]:gap-x-6 xl:gap-x-7">
            {!children &&
              NAV.map((item) => (
                <Link
                  key={item.hash}
                  href={{ pathname: "/", hash: item.hash }}
                  className={`${LINK} max-lg:hidden`}
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
            {/* Ordinateur : l'action apparaît dès qu'on descend (en haut, celle de l'accroche suffit ; sur téléphone, elle est dans le menu). */}
            {!children && (
              <Link
                href={{ pathname: "/", hash: "tarifs" }}
                className="inline-flex min-h-11 items-center rounded-full bg-brick px-5 text-[0.95rem] font-semibold text-white transition-[opacity,visibility,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(212,64,47,.3)] group-data-[scrolled=false]/hdr:invisible group-data-[scrolled=false]/hdr:opacity-0 max-lg:hidden"
              >
                {t("home.cta")}
              </Link>
            )}
          </nav>
        </header>
      </HeaderShell>
    </>
  );
}
