import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";

const NAV = [
  { hash: "etapes", key: "how" },
  { hash: "tarifs", key: "pricing" },
  { hash: "questions", key: "questions" },
] as const;

/**
 * En-tête du site commercial : logo, liens vers les sections de l'accueil,
 * langue, connexion (ou contenu fourni à droite).
 */
export async function PlatformHeader({ children }: { children?: React.ReactNode }) {
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
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" aria-label={t("common.homeLink", { product })}>
          <Logo productName={product} className="text-[1.8rem]" />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 font-medium text-night">
          {!children &&
            NAV.map((item) => (
              <Link
                key={item.hash}
                href={{ pathname: "/", hash: item.hash }}
                className="hidden transition-colors hover:text-brick md:inline"
              >
                {t(`home.nav.${item.key}`)}
              </Link>
            ))}
          <LanguageSwitcher />
          {children ?? (
            <Link href="/connexion" className="transition-colors hover:text-brick">
              {t("common.login")}
            </Link>
          )}
        </nav>
      </header>
    </>
  );
}
