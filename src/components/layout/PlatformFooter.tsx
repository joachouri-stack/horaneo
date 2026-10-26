import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { NAV } from "@/components/layout/PlatformHeader";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";

const LINK = "inline-flex min-h-11 items-center text-night transition-colors hover:text-brick";
const HEADING = "mb-1 text-[0.9375rem] font-semibold uppercase tracking-[0.12em] text-stone";

/**
 * Pied de page du site commercial : logo, phrase d'accroche et adresse de
 * contact ; sections de l'accueil ; espace pro ; documents légaux et droits.
 */
export async function PlatformFooter() {
  const [t, tNav, tCommon] = await Promise.all([
    getTranslations("home.footer"),
    getTranslations("home.nav"),
    getTranslations("common"),
  ]);
  const config = env();
  const product = config.PRODUCT_NAME;
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const legal = [
    { href: "/mentions-legales", label: t("legal") },
    { href: "/confidentialite", label: t("privacy") },
    { href: "/conditions", label: t("terms") },
  ] as const;
  return (
    <footer className="mx-auto max-w-[75rem] px-4 pb-10 pt-8 sm:px-6">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-b border-line pb-8 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <Link
            href="/"
            aria-label={tCommon("homeLink", { product })}
            className="inline-flex min-h-11 items-center"
          >
            <Logo productName={product} className="text-[1.8rem]" />
          </Link>
          <p className="mt-3 max-w-[22rem] text-[1.0625rem] text-body">{t("tagline")}</p>
          <a href={`mailto:${contact}`} className={`${LINK} font-semibold underline underline-offset-4`}>
            {contact}
          </a>
        </div>
        <nav aria-labelledby="pied-decouvrir">
          <p id="pied-decouvrir" className={HEADING}>
            {t("discover")}
          </p>
          <ul className="text-[1.0625rem]">
            {NAV.map((item) => (
              <li key={item.hash}>
                <Link href={{ pathname: "/", hash: item.hash }} className={LINK}>
                  {tNav(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-labelledby="pied-pro">
          <p id="pied-pro" className={HEADING}>
            {t("pro")}
          </p>
          <ul className="text-[1.0625rem]">
            <li>
              <Link href="/connexion" className={LINK}>
                {tCommon("login")}
              </Link>
            </li>
            <li>
              <a href={`mailto:${contact}`} className={LINK}>
                {t("contact")}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-5 text-[1.0625rem] text-[#5f5b54]">
        <p>{t("rights", { year: new Date().getFullYear(), product: product.toLocaleUpperCase() })}</p>
        <nav aria-label={t("legal")}>
          <ul className="flex flex-wrap gap-x-6">
            {legal.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={`${LINK} underline`}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>{t("credit")}</p>
      </div>
    </footer>
  );
}
