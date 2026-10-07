import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/Logo";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";

/** Pied de page du site commercial : logo, documents légaux, droits. */
export async function PlatformFooter() {
  const [t, tCommon] = await Promise.all([getTranslations("home.footer"), getTranslations("common")]);
  const product = env().PRODUCT_NAME;
  const links = [
    { href: "/mentions-legales", label: t("legal") },
    { href: "/confidentialite", label: t("privacy") },
    { href: "/conditions", label: t("terms") },
  ] as const;
  return (
    <footer className="mx-auto max-w-[75rem] px-4 pb-10 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <Link href="/" aria-label={tCommon("homeLink", { product })}>
          <Logo productName={product} className="text-[1.8rem]" />
        </Link>
        <nav aria-label={t("legal")}>
          <ul className="flex flex-wrap gap-x-6 text-[0.95rem]">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center text-night underline transition-colors hover:text-brick"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-5 text-[0.95rem] text-[#5f5b54]">
        <p>{t("rights", { year: new Date().getFullYear(), product: product.toLocaleUpperCase() })}</p>
        <p>{t("credit")}</p>
      </div>
    </footer>
  );
}
