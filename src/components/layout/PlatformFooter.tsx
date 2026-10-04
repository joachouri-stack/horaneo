import { getTranslations } from "next-intl/server";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";

/** Pied de page du site commercial : documents légaux. */
export async function PlatformFooter() {
  const t = await getTranslations("home.footer");
  const product = env().PRODUCT_NAME;
  return (
    <footer className="border-t border-navy/10 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("legal")}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link href="/mentions-legales" className="text-navy underline">
                {t("legal")}
              </Link>
            </li>
            <li>
              <Link href="/confidentialite" className="text-navy underline">
                {t("privacy")}
              </Link>
            </li>
            <li>
              <Link href="/conditions" className="text-navy underline">
                {t("terms")}
              </Link>
            </li>
          </ul>
        </nav>
        <p className="text-ink/70">{t("rights", { year: new Date().getFullYear(), product })}</p>
      </div>
    </footer>
  );
}
