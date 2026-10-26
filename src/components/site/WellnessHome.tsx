import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { SiteCategory, SiteData } from "@/modules/site/data";
import { heroSecondPhoto, siteReviews } from "@/modules/site/data";
import { formatClock, formatDuration, openDaysSpan, openStatus } from "@/modules/site/format";
import { categoryPath, SITE_PATHS } from "@/modules/site/paths";
import { BookButton } from "./BookButton";
import { Stars } from "./GoogleReviews";
import { SiteImage } from "./SiteImage";

/**
 * Blocs de l'accueil du modèle par défaut : haut de page en deux colonnes avec photos,
 * repères de confiance (note Google, ouvert maintenant, réservation en ligne), cartes des
 * catégories, équipe et bandeau final. Tout suit les couleurs et les contenus du salon.
 */

type Site = NonNullable<SiteData>;

/** Initiales d'un nom (pastille sans photo). */
function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Repères sous l'accroche : note Google, ouvert maintenant, réservation en ligne. */
async function TrustRow({ site }: { site: Site }) {
  const t = await getTranslations("site.home");
  const tReviews = await getTranslations("site.reviews");
  const tDays = await getTranslations("weekdays");
  const reviews = site.features.googleReviews ? siteReviews(site) : null;
  const status = openStatus(site.openingHours, site.tenant.timezone);
  const clock = (time: string) => formatClock(time, site.locale);
  const chip =
    "inline-flex min-h-9 items-center gap-2 rounded-full bg-site-card px-3.5 text-sm text-site-text shadow-sm";
  const items: React.ReactNode[] = [];
  if (reviews?.rating) {
    const rating = new Intl.NumberFormat(site.locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(reviews.rating);
    items.push(
      <a key="reviews" href={reviews.url} target="_blank" rel="noopener noreferrer" className={chip}>
        <Stars rating={reviews.rating} />
        <span>{tReviews("summary", { rating, count: reviews.total })}</span>
      </a>,
    );
  }
  if (status) {
    items.push(
      <span key="open" className={chip}>
        <span
          aria-hidden="true"
          className={`size-2 rounded-full ${status.open ? "bg-[#3fb27f]" : "bg-current opacity-40"}`}
        />
        {status.open
          ? t("openNow", { time: clock(status.closesAt) })
          : status.inDays === 0
            ? t("opensToday", { time: clock(status.opensAt) })
            : status.inDays === 1
              ? t("opensTomorrow", { time: clock(status.opensAt) })
              : t("opensOn", {
                  day: tDays(String(status.weekday) as "1").toLowerCase(),
                  time: clock(status.opensAt),
                })}
      </span>,
    );
  }
  if (site.bookingEnabled) {
    items.push(
      <span key="online" className={chip}>
        {t("onlineBooking")}
      </span>,
    );
  }
  if (items.length === 0) return null;
  return <div className="mt-8 flex flex-wrap gap-2">{items}</div>;
}

/** Haut de page : nom, accroche, boutons et repères ; photos à droite (ou en fond sur téléphone). */
export async function HomeHero({ site, cta }: { site: Site; cta: { href: string; label: string } | null }) {
  const t = await getTranslations("site");
  const tAtelier = await getTranslations("site.atelier");
  const tDays = await getTranslations("weekdays");
  const home = site.pages.home;
  const cover = home?.photo ?? null;
  const second = site.features.fullSite ? heroSecondPhoto(site) : null;
  const span = openDaysSpan(site.openingHours);
  return (
    <section className="relative overflow-hidden bg-site-surface">
      {/* Halo décoratif aux couleurs du salon. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 size-[34rem] rounded-full bg-site-accent opacity-[0.08]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <p className="inline-flex flex-wrap items-center gap-x-2 rounded-full border border-site-border bg-site-card px-4 py-1.5 text-sm text-site-text">
            <strong className="font-semibold">{tAtelier("byAppointment")}</strong>
            {span && (
              <span className="text-site-muted">
                ·{" "}
                {tAtelier("daysSpan", {
                  from: tDays(String(span.from) as "1").toLowerCase(),
                  to: tDays(String(span.to) as "1").toLowerCase(),
                })}
              </span>
            )}
          </p>
          <h1 className="mt-6 font-site-display text-5xl font-semibold leading-[1.02] text-site-heading sm:text-6xl">
            {site.tenant.name}
          </h1>
          {home?.texts.tagline && (
            <p className="mt-5 max-w-xl text-xl leading-relaxed text-site-text sm:text-2xl">
              {home.texts.tagline}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {cta && <BookButton href={cta.href} label={cta.label} size="lg" />}
            {site.features.fullSite && site.services.length > 0 && (
              <Link
                href={SITE_PATHS.services}
                className="inline-flex min-h-14 items-center rounded-site border border-site-border bg-site-card px-6 text-lg font-semibold text-site-text transition hover:border-site-accent"
              >
                {t("home.discover")}
              </Link>
            )}
          </div>
          <TrustRow site={site} />
        </div>

        <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:max-w-none">
          {cover ? (
            <SiteImage
              image={cover}
              sizes="(min-width: 1024px) 45vw, 100vw"
              priority
              alt=""
              className="aspect-[5/4] w-full rounded-[2rem] lg:aspect-[4/5] lg:rounded-t-[999px] lg:rounded-b-[2rem] object-cover shadow-[0_30px_60px_-30px_rgba(0,0,0,.45)]"
            />
          ) : (
            // Pas encore de photo : un médaillon aux couleurs du salon plutôt qu'un bloc vide.
            <div className="flex aspect-[5/4] w-full items-center justify-center rounded-[2rem] bg-site-accent lg:aspect-[4/5] lg:rounded-t-[999px] lg:rounded-b-[2rem]">
              <span className="font-site-display text-[7rem] font-semibold leading-none text-site-on-button opacity-90">
                {initials(site.tenant.name)}
              </span>
            </div>
          )}
          {second && cover && (
            <SiteImage
              image={second}
              sizes="220px"
              alt=""
              className="absolute -bottom-6 -left-6 hidden aspect-square w-44 rounded-[1.5rem] border-4 border-site-surface object-cover shadow-xl sm:block"
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Catégories en cartes : quelques soins avec leur prix, « dès … », lien vers la catégorie. */
export async function CategoryCards({
  site,
  categories,
  popularIds,
}: {
  site: Site;
  categories: SiteCategory[];
  popularIds: string[];
}) {
  const t = await getTranslations("site.home");
  const tAtelier = await getTranslations("site.atelier");
  const tServices = await getTranslations("site.services");
  const money = (cents: number) => formatMoney(cents, site.tenant.currency, site.locale);
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {categories.map((category) => {
        const shown = category.services.slice(0, 3);
        return (
          <li key={category.id} className="min-w-0">
            <Link
              href={categoryPath(category.slug)}
              className="group flex h-full flex-col rounded-[1.5rem] border border-site-border bg-site-card p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-site-accent hover:shadow-md"
            >
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="block font-site-display text-2xl font-semibold text-site-heading">
                    {category.name}
                  </span>
                  <span className="mt-1 block text-sm text-site-muted">
                    {tAtelier("servicesCount", { count: category.services.length })}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-site-surface px-3 py-1 text-sm font-semibold text-site-accent">
                  {tAtelier("from", { price: money(category.minPriceCents) })}
                </span>
              </span>
              {category.description && (
                <span className="mt-3 line-clamp-2 block text-site-muted">{category.description}</span>
              )}
              <span className="mt-4 block divide-y divide-site-border border-t border-site-border">
                {shown.map((service) => (
                  <span
                    key={service.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-[0.95rem]"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-site-text">{service.name}</span>
                      {popularIds.includes(service.id) && (
                        <span className="shrink-0 rounded-full bg-site-accent px-2 py-px text-[0.7rem] font-semibold text-site-on-button">
                          {t("popular")}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-site-muted">
                      {formatDuration(
                        (key, values) => tServices(key as "durationMinutes", values),
                        service.durationMinutes,
                      )}
                      {" · "}
                      <span className="font-semibold text-site-text">
                        {money(service.promo?.priceCents ?? service.priceCents)}
                      </span>
                    </span>
                  </span>
                ))}
              </span>
              <span className="mt-auto pt-4 font-semibold text-site-accent">
                {tAtelier("seeServices")} <span aria-hidden="true">→</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** L'équipe : photo (ou initiales), nom et présentation. */
export async function TeamCards({ site }: { site: Site }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {site.staff.map((member) => (
        <li key={member.id} className="flex gap-4 rounded-[1.5rem] bg-site-panel p-5">
          {member.photo ? (
            <SiteImage
              image={member.photo}
              alt=""
              sizes="80px"
              className="size-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-20 shrink-0 items-center justify-center rounded-full bg-site-accent font-site-display text-2xl font-semibold text-site-on-button"
            >
              {initials(member.name)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block font-site-display text-xl font-semibold text-site-heading">
              {member.name}
            </span>
            {member.bio && <span className="mt-1 line-clamp-3 block text-site-muted">{member.bio}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Bandeau final : une phrase et le bouton de réservation (ou « Appeler »). */
export async function BookBanner({ site, cta }: { site: Site; cta: { href: string; label: string } | null }) {
  const t = await getTranslations("site.atelier");
  if (!cta) return null;
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-site-button px-6 py-12 text-site-on-button sm:px-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -right-16 size-72 rounded-full bg-site-on-button opacity-10"
      />
      <h2 className="font-site-display text-3xl font-semibold sm:text-4xl">{t("ctaTitle")}</h2>
      <p className="mt-2 max-w-xl opacity-90">{site.bookingEnabled ? t("ctaText") : t("ctaTextContact")}</p>
      <Link
        href={cta.href}
        className="mt-6 inline-flex min-h-12 items-center rounded-site bg-site-on-button px-6 font-semibold text-site-button transition hover:opacity-90"
      >
        {cta.label}
      </Link>
    </section>
  );
}
