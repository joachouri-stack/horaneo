import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";

/** En-tête du site commercial : logo, langue, connexion (ou contenu fourni à droite). */
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
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" aria-label={t("common.homeLink", { product })}>
          <Logo productName={product} className="text-2xl" />
        </Link>
        <nav className="flex items-center gap-4">
          <LanguageSwitcher />
          {children ?? (
            <Link href="/connexion" className="font-semibold text-navy hover:underline">
              {t("common.login")}
            </Link>
          )}
        </nav>
      </header>
    </>
  );
}
