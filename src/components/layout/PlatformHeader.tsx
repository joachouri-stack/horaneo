import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { HeaderShell } from "./HeaderShell";

export const NAV = [
  { hash: "solutions", key: "solutions" },
  { hash: "tarifs", key: "pricing" },
  { hash: "fonctionnalites", key: "features" },
  { hash: "questions", key: "resources" },
] as const;

const LINK = "inline-flex min-h-11 items-center transition-colors hover:text-navy";

/**
 * En-tête du site commercial (maquette validée) : logo à gauche ; à droite,
 * les liens vers les sections de l'accueil (masqués sur téléphone), la langue
 * et la connexion. Un contenu fourni à droite remplace la connexion.
 */
export async function PlatformHeader({ children }: { children?: React.ReactNode }) {
  const t = await getTranslations();
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
          <nav className="flex flex-wrap items-center gap-x-3 text-[0.95rem] text-[#3d4457] min-[400px]:gap-x-6 xl:gap-x-8">
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
            {/* Une seule langue ouverte : pas de choix de langue à proposer. */}
            {routing.locales.length > 1 && <LanguageSwitcher />}
            {children ?? (
              <Link href="/connexion" className={LINK}>
                {t("common.login")}
              </Link>
            )}
            {/* Ordinateur : « Essayer gratuitement » (pack Basic) ; sur téléphone, dans le menu. */}
            {!children && (
              <Link
                href={{ pathname: "/commander", query: { pack: "basic" } }}
                className="group/cta inline-flex min-h-11 items-center gap-2 rounded-xl bg-navy px-5 text-[0.93rem] font-medium text-white shadow-[0_6px_16px_-8px_rgba(27,42,74,.6)] transition hover:-translate-y-px hover:bg-[#22345c] max-lg:hidden"
              >
                {t("home.cta")}
                <span aria-hidden="true" className="transition-transform group-hover/cta:translate-x-0.5">
                  →
                </span>
              </Link>
            )}
          </nav>
        </header>
      </HeaderShell>
    </>
  );
}
