import type { Metadata } from "next";
import { pickLocalized } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { Comparison } from "@/components/marketing/Comparison";
import {
  ArrowLine,
  BellLine,
  BoxLine,
  CalendarLine,
  CardLine,
  ChartLine,
  CheckLine,
  FileLine,
  GiftLine,
  LockLine,
  MegaphoneLine,
  PlayCircleLine,
  PlayLine,
  PlusLine,
  RefreshLine,
  ServerLine,
  ShieldLine,
  SparkleLine,
  StoreLine,
  TagLine,
  TrendLine,
  UsersLine,
  AwardLine,
  CapLine,
} from "@/components/marketing/line-icons";
import { PlanCards } from "@/components/marketing/PlanCards";
import { SolutionScope, SolutionTabs } from "@/components/marketing/SolutionScope";
import { SolutionVisual } from "@/components/marketing/SolutionVisual";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { SOLUTIONS, type Solution } from "@/modules/billing/grid";
import { listLaunchOffers } from "@/modules/billing/launch-offers";
import { listPublicPlans } from "@/modules/billing/plans";
import { salesOpen } from "@/modules/legal/documents";
import { getPlatformSetting } from "@/modules/settings";
import { listShowcase } from "@/modules/showcase/showcase";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "metadata" });
  const base = publicAppUrl();
  return {
    title: t("title", { product: env().PRODUCT_NAME }),
    description: t("description"),
    alternates: {
      canonical: `${base}/${locale}`,
      languages: Object.fromEntries(ENABLED_LOCALES.map((item) => [item, `${base}/${item}`])),
    },
    openGraph: {
      title: t("title", { product: env().PRODUCT_NAME }),
      description: t("description"),
      type: "website",
    },
  };
}

/** Questions fréquentes, dans l'ordre (textes : home.faq.items.<clé>). */
const FAQ = [
  "basic",
  "commitment",
  "prices",
  "domain",
  "quotas",
  "change",
  "solutions",
  "ai",
  "tablet",
  "data",
] as const;

/** Pictogrammes du bandeau de fonctions de chaque solution (dans l'ordre des textes). */
const STRIP: Record<Solution, (typeof CheckLine)[]> = {
  booking: [CalendarLine, BellLine, LockLine, UsersLine, ChartLine],
  commerce: [StoreLine, BoxLine, FileLine, TagLine, GiftLine],
  formation: [PlayLine, FileLine, CapLine, AwardLine, TrendLine],
};

const BENEFITS = [
  { key: "sales", Icon: CalendarLine },
  { key: "payments", Icon: CardLine },
  { key: "clients", Icon: UsersLine },
  { key: "automation", Icon: RefreshLine, feature: "marketingAutomation" },
  { key: "assistant", Icon: SparkleLine, feature: "aiChatbot" },
  { key: "marketing", Icon: MegaphoneLine },
  { key: "stats", Icon: ChartLine },
] as const;

const TRUST = [
  { key: "stripe", Icon: LockLine },
  { key: "commission", Icon: CardLine },
  { key: "hosting", Icon: ServerLine },
  { key: "data", Icon: ShieldLine },
  { key: "noOverage", Icon: CheckLine },
] as const;

const TITLE = "font-display font-semibold tracking-[-0.025em] text-night";
const EYEBROW =
  "inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[0.75rem] font-medium uppercase tracking-[0.08em] text-accent-strong";
const PRIMARY =
  "group inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[0.95rem] font-medium text-white shadow-[0_12px_24px_-14px_var(--accent)] transition hover:-translate-y-px hover:bg-accent-strong motion-reduce:transition-none";
const SECONDARY =
  "inline-flex min-h-12 items-center gap-2 rounded-xl border border-hairline bg-white px-5 text-[0.95rem] font-medium text-night transition hover:border-accent-line hover:text-accent-strong";

/**
 * Site commercial : « Votre activité. Un seul outil. Plus de liberté. »
 * Une marque, trois solutions (Réservation, Commerce, Formation) qui
 * partagent les mêmes packs (Basic, Pro, Business). Le choix d'une solution
 * change l'accent, les textes, les visuels et le comparatif ; les tarifs ne
 * changent pas. Prix, quotas, disponibilités et offre tablette viennent des
 * réglages (base), jamais du code.
 */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const config = env();
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: String(await getPlatformSetting(tx, "prices_display")),
    commission: Number(await getPlatformSetting(tx, "deposit_commission_percent")),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    warningPercent: Number(await getPlatformSetting(tx, "sms_warning_percent")),
    soon: await getPlatformSetting(tx, "features_soon"),
    solutions: await getPlatformSetting(tx, "solutions"),
    demoUrl: String(await getPlatformSetting(tx, "demo_url")),
    salesOpen: await salesOpen(tx),
    offers: await listLaunchOffers(tx, { openOnly: true }),
    showcase: await listShowcase(tx),
  }));
  const soon = new Set<string>(data.soon);
  const isSoon = (solution: Solution) =>
    data.solutions.find((item) => item.code === solution)?.status !== "available";
  // Premier pack de la grille (le moins cher) : bouton « Commencer » et question de la FAQ.
  const first = [...data.plans].sort((a, b) => a.priceCents - b.priceCents)[0];
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const startHref = { pathname: "/commander" as const, query: first ? { pack: first.code } : {} };

  const faqValues = {
    months: data.commitment,
    display: data.display,
    percent: data.warningPercent,
    product: config.PRODUCT_NAME,
    plan: first ? pickLocalized(first.name, locale) : "",
    price: first ? formatMoney(first.priceCents, first.currency, locale) : "",
    free: first && first.priceCents <= 0 ? "yes" : "no",
    bookings: first?.limits.onlineBookingsPerMonth ?? 0,
    customers: first?.limits.customers ?? 0,
  };
  const faq = FAQ.map((key) => ({
    key,
    q: t(`faq.items.${key}.q`, faqValues),
    a: t(`faq.items.${key}.a`, faqValues),
  }));
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: config.PRODUCT_NAME,
      url: publicAppUrl(),
      email: contact,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];

  return (
    <div className="bg-white text-[1rem] font-light leading-[1.65] text-[#3d4457]">
      <script
        type="application/ld+json"
        // Le « < » est échappé : le texte ne peut pas fermer la balise.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <PlatformHeader />
      <main id="contenu">
        <SolutionScope>
          {/* Accroche */}
          <section className="relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(60rem_26rem_at_50%_-6rem,var(--accent-soft),transparent_70%)]"
            />
            <div className="hn-up relative mx-auto max-w-[56rem] px-4 pb-10 pt-12 text-center sm:px-6 lg:pb-12 lg:pt-20">
              <p className={EYEBROW}>{t("hero.badge")}</p>
              <h1 className={`${TITLE} mt-5 text-[clamp(2.1rem,5vw,3.6rem)] leading-[1.06]`}>
                {t("hero.title")} <br className="max-sm:hidden" />
                <span className="text-accent">{t("hero.titleAccent")}</span>
              </h1>
              <p className="mx-auto mt-5 max-w-[38rem] text-[1.08rem] text-ink-soft lg:text-[1.15rem]">
                {t("hero.subtitle")}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link href={startHref} className={PRIMARY}>
                  {t("cta")}
                  <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                </Link>
                {/* La démonstration n'apparaît que si une adresse est réglée dans l'admin. */}
                {data.demoUrl ? (
                  <a href={data.demoUrl} target="_blank" rel="noopener" className={SECONDARY}>
                    <PlayCircleLine className="size-[18px] text-accent" />
                    {t("hero.demo")}
                  </a>
                ) : (
                  <a href="#tarifs" className={SECONDARY}>
                    {t("hero.pricing")}
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* Choisissez votre solution */}
          <section id="solutions" aria-labelledby="titre-solutions" className="scroll-mt-20 px-4 sm:px-6">
            <div className="mx-auto max-w-[75rem]">
              <h2 id="titre-solutions" className="sr-only">
                {t("solutions.title")}
              </h2>
              <SolutionTabs
                label={t("solutions.label")}
                soonLabel={t("solutions.soon")}
                items={SOLUTIONS.map((code) => ({
                  code,
                  name: t(`solutions.items.${code}.name`),
                  short: t(`solutions.items.${code}.short`),
                  soon: isSoon(code),
                }))}
              />

              {SOLUTIONS.map((code) => (
                <div key={code} data-only={code} className="pt-10 lg:pt-14">
                  <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
                    <div>
                      <p className={EYEBROW}>
                        {t(`solutions.items.${code}.badge`)}
                        {isSoon(code) && (
                          <span className="rounded-full bg-white px-2 py-px text-[0.68rem] normal-case tracking-normal text-ink-soft">
                            {t("solutions.soon")}
                          </span>
                        )}
                      </p>
                      <h3
                        className={`${TITLE} hn-balance mt-4 text-[clamp(1.7rem,3vw,2.35rem)] leading-[1.1]`}
                      >
                        {t(`solutions.items.${code}.title`)}
                        <br />
                        <span className="text-accent">{t(`solutions.items.${code}.titleAccent`)}</span>
                      </h3>
                      <p className="mt-4 max-w-[32rem] text-[1.03rem] text-ink-soft">
                        {t(`solutions.items.${code}.text`)}
                      </p>
                      <ul className="mt-6 grid gap-2.5 text-[0.98rem] text-[#2d3446]">
                        {(t.raw(`solutions.items.${code}.bullets`) as string[]).map((item) => (
                          <li key={item} className="flex items-center gap-3">
                            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-accent text-white">
                              <CheckLine className="size-3.5" />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-5 text-[0.85rem] text-ink-soft">
                        <span className="font-medium text-night">{t("solutions.for")} : </span>
                        {(t.raw(`solutions.items.${code}.targets`) as string[]).join(" · ")}
                      </p>
                      {isSoon(code) ? (
                        <div className="mt-7">
                          <Link href={{ pathname: "/rappel", query: { solution: code } }} className={PRIMARY}>
                            {t("solutions.ctaSoon")}
                            <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          <p className="mt-3 max-w-[30rem] text-[0.82rem] text-ink-soft">
                            {t("solutions.soonNote")}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-7 flex flex-wrap gap-3">
                          <Link href={startHref} className={PRIMARY}>
                            {t("cta")}
                            <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          {data.demoUrl && (
                            <a href={data.demoUrl} target="_blank" rel="noopener" className={SECONDARY}>
                              <PlayCircleLine className="size-[18px] text-accent" />
                              {t("hero.demo")}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <SolutionVisual solution={code} />
                  </div>

                  {/* Bandeau des fonctions de la solution */}
                  <ul className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-3 lg:mt-12 lg:grid-cols-5">
                    {(t.raw(`solutions.items.${code}.strip`) as string[]).map((item, index) => {
                      const Icon = STRIP[code][index] ?? CheckLine;
                      return (
                        <li
                          key={item}
                          className="flex flex-col items-center gap-2 bg-white px-3 py-5 text-center text-[0.85rem] text-[#2d3446] max-sm:last:col-span-2"
                        >
                          <Icon className="size-6 text-accent" />
                          {item}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Choisissez votre pack */}
          <section
            id="tarifs"
            aria-labelledby="titre-tarifs"
            className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-28"
          >
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4 lg:mb-12">
              <div>
                <h2 id="titre-tarifs" className={`${TITLE} text-[clamp(1.8rem,3.4vw,2.5rem)] leading-[1.1]`}>
                  {t("plans.title")}
                  {SOLUTIONS.map((code) => (
                    <span key={code} data-only={code} className="text-accent">
                      {" "}
                      {t(`solutions.items.${code}.name`)}
                    </span>
                  ))}
                </h2>
                <p className="mt-2 max-w-[36rem] text-ink-soft">{t("plans.subtitle")}</p>
              </div>
              <p className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[0.82rem] font-medium text-accent-strong">
                {t("plans.monthly", { display: data.display })}
              </p>
            </div>
            {/* Solution en préparation : les packs se souscrivent aujourd'hui pour la Réservation. */}
            {SOLUTIONS.filter(isSoon).map((code) => (
              <p
                key={code}
                data-only={code}
                className="mb-8 rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-[0.9rem] text-accent-strong"
              >
                {t("plans.soonSolution", { solution: t(`solutions.items.${code}.name`) })}
              </p>
            ))}
            <PlanCards
              plans={data.plans}
              locale={locale}
              soon={data.soon}
              salesOpen={data.salesOpen}
              display={data.display}
              commitmentMonths={data.commitment}
              offers={data.offers}
            />
            <p className="mt-6 text-center text-[0.82rem] text-ink-soft">{t("plans.quotaNote")}</p>
          </section>

          {/* Les bénéfices */}
          <section
            id="fonctionnalites"
            aria-labelledby="titre-benefices"
            className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-28"
          >
            <p className={EYEBROW}>{t("benefits.badge")}</p>
            <h2
              id="titre-benefices"
              className={`${TITLE} mt-4 max-w-[44rem] text-[clamp(1.8rem,3.4vw,2.5rem)] leading-[1.1]`}
            >
              {t("benefits.title")} <span className="text-accent">{t("benefits.titleAccent")}</span>
            </h2>
            <ul className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map((item) => {
                const later = "feature" in item && soon.has(item.feature);
                return (
                  <li key={item.key}>
                    <span className="flex size-11 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent">
                      <item.Icon className="size-[22px]" />
                    </span>
                    <h3 className="mt-4 flex flex-wrap items-center gap-2 font-display text-[1.05rem] font-semibold text-night">
                      {t(`benefits.items.${item.key}.title`)}
                      {later && (
                        <span className="rounded-full bg-mist-50 px-2 py-px font-sans text-[0.68rem] font-normal text-ink-soft">
                          {t("plans.soonTag")}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-[0.92rem] text-ink-soft">
                      {t(`benefits.items.${item.key}.text`)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Comparatif détaillé */}
          <section
            id="comparatif"
            aria-labelledby="titre-comparatif"
            className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-28"
          >
            <h2
              id="titre-comparatif"
              className={`${TITLE} mb-8 text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.1]`}
            >
              {t("comparison.title")}
              {SOLUTIONS.map((code) => (
                <span key={code} data-only={code} className="text-accent">
                  {" – "}
                  {t(`solutions.items.${code}.name`)}
                </span>
              ))}
            </h2>
            <Comparison plans={data.plans} locale={locale} soon={data.soon} display={data.display} />
          </section>
        </SolutionScope>

        {/* Réassurance : seulement des engagements vérifiés */}
        <section
          aria-labelledby="titre-confiance"
          className="mx-auto max-w-[75rem] px-4 pt-20 sm:px-6 lg:pt-28"
        >
          <h2 id="titre-confiance" className={`${TITLE} text-center text-[clamp(1.5rem,2.6vw,1.9rem)]`}>
            {t("trust.title")}
          </h2>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-5">
            {TRUST.map(({ key, Icon }) => (
              <li key={key} className="bg-white p-5">
                <Icon className="size-6 text-navy" />
                <p className="mt-3 font-medium text-night">
                  {t(`trust.items.${key}.title`, { percent: data.commission })}
                </p>
                <p className="mt-1 text-[0.85rem] leading-snug text-ink-soft">
                  {t(`trust.items.${key}.text`)}
                </p>
              </li>
            ))}
          </ul>
          {/* Témoignages réels saisis dans l'admin (bloc caché s'il n'y en a pas). */}
          {data.showcase.length > 0 && (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.showcase.map((entry) => (
                <li key={entry.id}>
                  <figure className="flex h-full flex-col rounded-2xl border border-hairline bg-white p-6">
                    <blockquote className="flex-1 text-night">« {entry.quote} »</blockquote>
                    <figcaption className="mt-4 text-[0.88rem] text-ink-soft">
                      <span className="font-medium text-night">{entry.author}</span> · {entry.name} ·{" "}
                      {entry.activity}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Questions */}
        <section
          id="questions"
          aria-labelledby="titre-questions"
          className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28"
        >
          <div className="mx-auto grid max-w-[75rem] gap-8 lg:grid-cols-[1fr_2fr] lg:gap-14">
            <div>
              <h2 id="titre-questions" className={`${TITLE} text-[clamp(1.6rem,3vw,2.2rem)] leading-[1.1]`}>
                {t("faq.title")}
              </h2>
              <p className="mt-3 text-ink-soft">{t("faq.intro")}</p>
              <a
                href={`mailto:${contact}`}
                className="mt-4 inline-flex min-h-11 items-center font-medium text-navy underline underline-offset-4"
              >
                {t("faq.contact")}
              </a>
            </div>
            <div className="divide-y divide-hairline border-y border-hairline">
              {faq.map((item, index) => (
                <details key={item.key} open={index === 0} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <PlusLine className="size-5 flex-none text-ink-soft transition-transform group-open:rotate-45 motion-reduce:transition-none" />
                  </summary>
                  <p className="pb-5 pr-8 text-[0.95rem] text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Bandeau final */}
        <section className="px-4 pb-16 sm:px-6">
          <div className="relative mx-auto max-w-[75rem] overflow-hidden rounded-[1.75rem] bg-[linear-gradient(120deg,#1b2a4a,#24366a_60%,#2f3f86)] px-6 py-14 text-center lg:py-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full border border-white/10"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full border border-white/10"
            />
            <h2 className="relative font-display text-[clamp(1.6rem,3vw,2.3rem)] font-semibold tracking-[-0.02em] text-white">
              {t("final.title")}
            </h2>
            <p className="relative mx-auto mt-3 max-w-[32rem] text-[#c8d0e4]">{t("final.text")}</p>
            <Link
              href={startHref}
              className="group relative mt-7 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-6 font-medium text-navy transition hover:-translate-y-px"
            >
              {t("final.cta")}
              <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
