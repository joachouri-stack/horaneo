import { ctaLabelKey, siteCta } from "@/modules/site/cta";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatPhone } from "@/modules/phone";
import type { SiteData } from "@/modules/site/data";
import { visibleSections } from "@/modules/site/data";
import { formatClock, summarizeHours, type HoursRow } from "@/modules/site/format";
import { businessPath, SITE_PATHS } from "@/modules/site/paths";
import { AtelierBrand } from "./AtelierHeader";
import { FacebookIcon, InstagramIcon } from "./icons";
import { PillLink } from "./ui";

type Site = NonNullable<SiteData>;

/** Horaires résumés (« Lundi au vendredi · 9 h à 19 h »), partagés par le pied de page et l'accueil. */
export async function HoursSummary({ site, detailed = false }: { site: Site; detailed?: boolean }) {
  const t = await getTranslations("site.atelier");
  const tDays = await getTranslations("weekdays");
  const day = (n: number) => tDays(String(n) as "1");
  const time = (value: string) => formatClock(value, site.locale);
  const rows: HoursRow[] = detailed
    ? [1, 2, 3, 4, 5, 6, 7].map((n) => {
        const ranges = site.openingHours.filter((range) => range.weekday === n);
        return ranges.length
          ? { from: n, to: n, kind: "ranges", ranges }
          : { from: n, to: n, kind: "closed" };
      })
    : summarizeHours(site.openingHours);
  return (
    <dl className="space-y-2">
      {rows.map((row) => (
        <div
          key={`${row.from}-${row.kind}`}
          className={`flex justify-between gap-4 ${row.kind === "closed" ? "opacity-70" : ""}`}
        >
          <dt>
            {row.from === row.to
              ? day(row.from)
              : t("groupDays", { from: day(row.from), to: day(row.to).toLowerCase() })}
          </dt>
          <dd className="text-right">
            {row.kind === "closed"
              ? t("closed")
              : row.kind === "opensLater"
                ? t("opensAt", { time: time(row.opensAt) })
                : row.ranges
                    .map((range) => t("range", { from: time(range.opensAt), to: time(range.closesAt) }))
                    .join(", ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Pied de page brun, nom en filigrane. Aucune marque du SaaS sur un site payant. */
export async function AtelierFooter({ site }: { site: Site }) {
  const t = await getTranslations("site.atelier");
  const tFooter = await getTranslations("site.footer");
  const tSite = await getTranslations("site");
  const tGift = await getTranslations("site.giftCard");
  const cta = siteCta(site);
  const { tenant } = site;
  const sections = visibleSections(site);
  const pages = site.businesses.filter((business) => business.slug && business.title);
  const phones = site.businesses.filter((business) => business.phone);
  const access = site.pages.practical?.texts.access;
  const credit = site.pages.legal?.texts.credit;
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-20 overflow-hidden rounded-t-[2.5rem] bg-site-text pb-28 text-site-bg sm:pb-0">
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-4">
            <AtelierBrand site={site} size="lg" />
            <p className="max-w-xs opacity-85">{t("footerAbout", { city: tenant.city || "none" })}</p>
            {(tenant.social.instagram || tenant.social.facebook) && (
              <ul className="flex gap-3">
                {tenant.social.instagram && (
                  <li>
                    <a
                      href={tenant.social.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("instagram")}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-current/30 hover:bg-white/10"
                    >
                      <InstagramIcon className="h-5 w-5" />
                    </a>
                  </li>
                )}
                {tenant.social.facebook && (
                  <li>
                    <a
                      href={tenant.social.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("facebook")}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-current/30 hover:bg-white/10"
                    >
                      <FacebookIcon className="h-5 w-5" />
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-4 font-site-display text-2xl">{t("footerServices")}</h2>
            <ul>
              {pages.map((business) => (
                <li key={business.id}>
                  <Link
                    href={businessPath(business.slug!)}
                    className="inline-block py-2 underline underline-offset-4 hover:opacity-80"
                  >
                    {t("businessLink", { title: business.title, name: business.name })}
                  </Link>
                </li>
              ))}
              {pages.length === 0 && sections.services && (
                <li>
                  <Link href={SITE_PATHS.services} className="inline-block py-2 underline underline-offset-4">
                    {tSite("nav.services")}
                  </Link>
                </li>
              )}
              {site.giftCardBusinessIds.length > 0 && (
                <li>
                  <Link
                    href={SITE_PATHS.giftCard}
                    className="inline-block py-2 underline underline-offset-4 hover:opacity-80"
                  >
                    {tGift("navLabel")}
                  </Link>
                </li>
              )}
              {sections.testimonials && (
                <li>
                  <Link
                    href={SITE_PATHS.testimonials}
                    className="inline-block py-2 underline underline-offset-4 hover:opacity-80"
                  >
                    {t("nav.testimonials")}
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="mb-4 font-site-display text-2xl">{t("findUs")}</h2>
            <address className="space-y-1 not-italic">
              {tenant.address && <p>{tenant.address}</p>}
              <p>{[tenant.postalCode, tenant.city].filter(Boolean).join(" ")}</p>
              {access && <p className="whitespace-pre-line opacity-75">{access}</p>}
              <div className="pt-2">
                {phones.length > 1
                  ? phones.map((business) => (
                      <p key={business.id}>
                        {t("phoneOf", { name: business.name })}{" "}
                        <a
                          href={`tel:${business.phone}`}
                          className="inline-block py-2 font-semibold underline underline-offset-4"
                        >
                          {formatPhone(business.phone, site.tenant.country)}
                        </a>
                      </p>
                    ))
                  : (phones[0]?.phone ?? tenant.phone) && (
                      <a
                        href={`tel:${phones[0]?.phone ?? tenant.phone}`}
                        className="inline-block py-2 font-semibold underline underline-offset-4"
                      >
                        {formatPhone(phones[0]?.phone ?? tenant.phone, site.tenant.country)}
                      </a>
                    )}
                {tenant.email && (
                  <p>
                    <a
                      href={`mailto:${tenant.email}`}
                      className="inline-block py-2 underline underline-offset-4"
                    >
                      {tenant.email}
                    </a>
                  </p>
                )}
              </div>
            </address>
          </div>

          <div>
            <h2 className="mb-4 font-site-display text-2xl">{t("hoursTitle")}</h2>
            <HoursSummary site={site} />
            {cta && (
              <PillLink href={cta.href} variant="light" className="mt-6">
                {tSite(ctaLabelKey(cta))}
              </PillLink>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-current/15 py-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="uppercase tracking-wide opacity-90">{t("rights", { year, name: tenant.name })}</p>
          <ul className="flex flex-wrap gap-x-6">
            <li>
              <Link href={SITE_PATHS.legal} className="inline-block py-2 underline underline-offset-4">
                {tFooter("legal")}
              </Link>
            </li>
            <li>
              <Link href={SITE_PATHS.privacy} className="inline-block py-2 underline underline-offset-4">
                {tFooter("privacy")}
              </Link>
            </li>
            <li>
              <Link href={SITE_PATHS.cancellation} className="inline-block py-2 underline underline-offset-4">
                {tFooter("cancellation")}
              </Link>
            </li>
          </ul>
        </div>
        {credit && <p className="pb-4 text-right text-sm opacity-75">{credit}</p>}
      </div>
      <p
        aria-hidden="true"
        className="pointer-events-none -mb-[0.22em] select-none whitespace-nowrap text-center font-site-display text-[clamp(3.5rem,11vw,10rem)] leading-none italic opacity-[0.07]"
      >
        {tenant.name}
      </p>
    </footer>
  );
}
