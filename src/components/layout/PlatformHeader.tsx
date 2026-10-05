import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { MenuLink } from "./MenuLink";

const NAV = [
  { hash: "etapes", key: "how" },
  { hash: "tarifs", key: "pricing" },
  { hash: "questions", key: "questions" },
] as const;

/**
 * En-tête du site commercial : logo, liens vers les sections de l'accueil,
 * langue, connexion (ou contenu fourni à droite). Il reste en haut de l'écran
 * et se couvre d'un fond dépoli dès qu'on fait défiler la page ; sur téléphone,
 * les liens s'ouvrent dans un menu (popover natif, sans JavaScript).
 */
export async function PlatformHeader({ children }: { children?: React.ReactNode }) {
  const t = await getTranslations();
  const product = env().PRODUCT_NAME;
  const navLink = "rounded-full px-3 py-1.5 transition-colors hover:bg-blush hover:text-rust";
  return (
    <>
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>
      <header className="hn-header sticky top-0 z-40 border-b border-transparent backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href="/" aria-label={t("common.homeLink", { product })}>
            <Logo productName={product} className="text-[1.7rem]" />
          </Link>
          <nav className="flex items-center gap-1 font-medium text-night">
            {!children && (
              <div className="hidden items-center gap-1 md:flex">
                {NAV.map((item) => (
                  <Link key={item.hash} href={{ pathname: "/", hash: item.hash }} className={navLink}>
                    {t(`home.nav.${item.key}`)}
                  </Link>
                ))}
              </div>
            )}
            <LanguageSwitcher />
            {children ?? (
              <>
                <Link
                  href="/connexion"
                  className="ml-1 rounded-full bg-night px-4 py-2 text-sm font-semibold text-white transition hover:bg-brick"
                >
                  {t("common.login")}
                </Link>
                <button
                  type="button"
                  popoverTarget="menu-mobile"
                  className="ml-1 flex size-10 items-center justify-center rounded-full border border-line bg-white md:hidden"
                  aria-label={t("home.nav.menu")}
                >
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path
                      d="M4 7h16M4 12h16M4 17h10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </>
            )}
          </nav>
        </div>
      </header>
      {!children && (
        <div
          id="menu-mobile"
          popover="auto"
          className="hn-drawer m-0 ml-auto h-dvh max-h-none w-[min(20rem,85vw)] border-0 bg-ivory p-6 shadow-2xl backdrop:bg-night/40 backdrop:backdrop-blur-sm"
        >
          <div className="mb-8 flex items-center justify-between">
            <Logo productName={product} className="text-2xl" />
            <button
              type="button"
              popoverTarget="menu-mobile"
              popoverTargetAction="hide"
              className="flex size-10 items-center justify-center rounded-full border border-line bg-white"
              aria-label={t("home.nav.close")}
            >
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <ul className="space-y-2 text-xl font-semibold text-night">
            {NAV.map((item) => (
              <li key={item.hash}>
                <MenuLink popover="menu-mobile" hash={item.hash}>
                  {t(`home.nav.${item.key}`)}
                </MenuLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
