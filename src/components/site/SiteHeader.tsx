import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";
import { visibleSections } from "@/modules/site/data";
import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import { SITE_PATHS } from "@/modules/site/paths";
import { BookButton } from "./BookButton";
import { AccountLink, accountMenuLink } from "./AccountLink";
import { MobileMenu } from "./MobileMenu";
import { SiteImage } from "./SiteImage";

/** En-tête collant : logo, menu, bouton « Réserver » toujours visible. */
export async function SiteHeader({
  site,
  showBook = true,
}: {
  site: NonNullable<SiteData>;
  showBook?: boolean;
}) {
  const t = await getTranslations("site");
  const sections = visibleSections(site);
  const cta = siteCta(site);
  const links = (
    [
      ["services", SITE_PATHS.services],
      ["about", SITE_PATHS.about],
      ["gallery", SITE_PATHS.gallery],
      ["testimonials", SITE_PATHS.testimonials],
      ["practical", SITE_PATHS.practical],
    ] as const
  )
    .filter(([key]) => sections[key])
    .map(([key, href]) => ({ href, label: t(`nav.${key}`) }));

  return (
    <header className="sticky top-0 z-30 border-b border-site-border bg-site-bg/95 backdrop-blur">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-site-bg focus:px-3 focus:py-2"
      >
        {t("skipToContent")}
      </a>
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href={SITE_PATHS.home}
          className="flex min-w-0 items-center gap-3"
          aria-label={`${site.tenant.name} — ${t("homeLabel")}`}
        >
          {site.logo ? (
            <SiteImage
              image={site.logo}
              alt={site.tenant.name}
              sizes="160px"
              priority
              className="h-10 w-auto max-w-40 object-contain sm:h-12"
            />
          ) : (
            <span className="truncate font-site-display text-2xl font-semibold text-site-heading">
              {site.tenant.name}
            </span>
          )}
        </Link>
        <nav aria-label={t("menu")} className="hidden md:block">
          <ul className="flex items-center gap-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-site-text hover:text-site-accent">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <AccountLink site={site} />
          {showBook && cta && <BookButton href={cta.href} label={t(ctaLabelKey(cta))} size="sm" />}
          <MobileMenu links={[...links, ...(await accountMenuLink(site))]} />
        </div>
      </div>
    </header>
  );
}
