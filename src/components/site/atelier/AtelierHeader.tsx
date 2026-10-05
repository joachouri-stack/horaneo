import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SiteData } from "@/modules/site/data";
import { visibleSections } from "@/modules/site/data";
import { businessPath, SITE_PATHS } from "@/modules/site/paths";
import { AccountLink, accountMenuLink } from "../AccountLink";
import { MobileMenu } from "../MobileMenu";
import { SiteImage } from "../SiteImage";
import { NavLinks } from "./NavLinks";
import { PillLink } from "./ui";

type Site = NonNullable<SiteData>;

/**
 * Liens du menu : la page de chaque professionnelle, les catégories choisies
 * pour le menu (ex. « Formations »), puis l'institut, les avis, les infos pratiques.
 */
export async function atelierLinks(site: Site) {
  const t = await getTranslations("site.atelier.nav");
  const sections = visibleSections(site);
  const slugOf = (businessId: string) => site.businesses.find((business) => business.id === businessId)?.slug;
  return [
    ...site.businesses
      .filter((business) => business.slug && business.title)
      .map((business) => ({ href: businessPath(business.slug!), label: business.title })),
    ...site.categories
      .filter((category) => category.inMenu)
      .map((category) => {
        const slug = slugOf(category.businessId);
        return {
          href: slug ? `${businessPath(slug)}#${category.slug}` : SITE_PATHS.services,
          label: category.name,
        };
      }),
    ...(sections.about ? [{ href: SITE_PATHS.about, label: t("about") }] : []),
    ...(sections.testimonials ? [{ href: SITE_PATHS.testimonials, label: t("testimonials") }] : []),
    { href: SITE_PATHS.practical, label: t("practical") },
  ];
}

/** Logo dans un médaillon rond, suivi du nom en lettres fines. */
export function AtelierBrand({ site, size = "md" }: { site: Site; size?: "md" | "lg" }) {
  const medal = size === "lg" ? "h-14 w-14" : "h-11 w-11 sm:h-14 sm:w-14";
  return (
    <span className="flex min-w-0 items-center gap-3">
      {site.logo && (
        <span
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm ${medal}`}
        >
          <SiteImage
            image={site.logo}
            alt=""
            sizes="56px"
            priority
            className="h-full w-full object-contain p-1"
          />
        </span>
      )}
      <span
        className={`truncate font-site-display text-xl font-medium sm:text-[1.7rem] ${size === "md" ? "lg:text-2xl xl:text-[1.7rem]" : ""}`}
      >
        {site.tenant.name}
      </span>
    </span>
  );
}

export async function AtelierHeader({ site, showBook = true }: { site: Site; showBook?: boolean }) {
  const t = await getTranslations("site");
  const cta = siteCta(site);
  const links = await atelierLinks(site);
  const mobileLinks = [...links, ...(await accountMenuLink(site))];
  return (
    <header className="sticky top-0 z-30 border-b border-site-border bg-site-bg/95 backdrop-blur">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:rounded focus:bg-site-bg focus:px-3 focus:py-2"
      >
        {t("skipToContent")}
      </a>
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <Link
          href={SITE_PATHS.home}
          aria-label={`${site.tenant.name} — ${t("homeLabel")}`}
          className="min-w-0 text-site-text"
        >
          <AtelierBrand site={site} />
        </Link>
        <nav aria-label={t("menu")} className="hidden lg:block">
          <NavLinks links={links} />
        </nav>
        <div className="flex items-center gap-2">
          <AccountLink site={site} />
          {showBook && cta && (
            <span className="hidden sm:block">
              <PillLink href={cta.href} size="sm">
                {t(ctaLabelKey(cta))}
              </PillLink>
            </span>
          )}
          <MobileMenu links={mobileLinks} hideFrom="lg" />
        </div>
      </div>
    </header>
  );
}
