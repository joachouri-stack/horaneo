import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { env } from "@/config/env";
import { formatPhone } from "@/modules/phone";
import type { SiteData } from "@/modules/site/data";
import { SITE_PATHS } from "@/modules/site/paths";

/**
 * Pied de page. La marque du SaaS n'y apparaît que sur la fiche Basic
 * (« Site créé par … ») ; sur un site payant, seulement dans les mentions légales.
 */
export async function SiteFooter({ site }: { site: NonNullable<SiteData> }) {
  const t = await getTranslations("site.footer");
  const { tenant } = site;
  const config = env();
  return (
    <footer className="mt-16 border-t border-site-border bg-site-surface pb-28 sm:pb-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:flex-row sm:justify-between">
        <div>
          <p className="font-site-display text-xl font-semibold text-site-accent">{tenant.name}</p>
          <p className="mt-1 text-site-muted">
            {[tenant.address, [tenant.postalCode, tenant.city].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(", ")}
          </p>
          {tenant.phone && (
            <a href={`tel:${tenant.phone}`} className="mt-1 block text-site-text">
              {formatPhone(tenant.phone)}
            </a>
          )}
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-site-muted">
          <li>
            <Link href={SITE_PATHS.legal} className="underline">
              {t("legal")}
            </Link>
          </li>
          <li>
            <Link href={SITE_PATHS.privacy} className="underline">
              {t("privacy")}
            </Link>
          </li>
          {site.features.brandingFooter && (
            <li>
              <a href={`https://${config.MAIN_DOMAIN}`} className="underline">
                {t("madeBy", { product: config.PRODUCT_NAME })}
              </a>
            </li>
          )}
        </ul>
      </div>
    </footer>
  );
}
