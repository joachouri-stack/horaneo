import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";
import { SITE_PATHS } from "@/modules/site/paths";
import { UserIcon } from "./atelier/icons";

/** « Mes rendez-vous » dans l'en-tête (pack avec l'espace des clientes) : bouton rond sur ordinateur. */
export async function AccountLink({ site }: { site: NonNullable<SiteData> }) {
  if (!site.features.customerSpace) return null;
  const t = await getTranslations("site.account");
  return (
    <Link
      href={SITE_PATHS.account}
      aria-label={t("navLink")}
      title={t("navLink")}
      className="hidden h-11 w-11 items-center justify-center rounded-full border border-site-border text-site-text transition hover:border-site-accent hover:text-site-accent sm:flex"
    >
      <UserIcon />
    </Link>
  );
}

/** Lien à ajouter au menu sur téléphone et au pied de page. */
export async function accountMenuLink(site: NonNullable<SiteData>) {
  if (!site.features.customerSpace) return [];
  const t = await getTranslations("site.account");
  return [{ href: SITE_PATHS.account, label: t("navLink") }];
}
