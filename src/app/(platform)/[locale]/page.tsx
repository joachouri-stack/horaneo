import type { Metadata } from "next";
import { pickLocalized } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import Image from "next/image";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import {
  ArrowLine,
  BellLine,
  BoxLine,
  CalendarLine,
  CardLine,
  ChartLine,
  CheckLine,
  ClockLine,
  DownloadLine,
  StarLine,
  FileLine,
  GiftLine,
  LockLine,
  MegaphoneLine,
  PlayCircleLine,
  PlayLine,
  PlusLine,
  RefreshLine,
  SparkleLine,
  StoreLine,
  TagLine,
  TrendLine,
  UsersLine,
  AwardLine,
  CapLine,
  BreadLine,
  BriefcaseLine,
  CameraLine,
  ForkKnifeLine,
  HammerLine,
  LeafLine,
  PaletteLine,
  PartyLine,
  ScaleLine,
  ScissorsLine,
  WrenchLine,
} from "@/components/marketing/line-icons";
import { PlanCards } from "@/components/marketing/PlanCards";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { BillingToggle, SolutionScope, SolutionTabs } from "@/components/marketing/SolutionScope";
import { SolutionVisual } from "@/components/marketing/SolutionVisual";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { SOLUTIONS, type Solution } from "@/modules/billing/grid";
import { listLaunchOffers } from "@/modules/billing/launch-offers";
import { listPublicPlans } from "@/modules/billing/plans";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "metadata" });
  const base = publicAppUrl();
  return {
    title: t("title", { product: env().PRODUCT_NAME }),
    description: t("description"),
    alternates: {
      canonical: `${base}/${locale}`,
      languages: {
        ...Object.fromEntries(ENABLED_LOCALES.map((item) => [item, `${base}/${item}`])),
        "x-default": `${base}/${ENABLED_LOCALES[0]}`,
      },
    },
    openGraph: {
      title: t("title", { product: env().PRODUCT_NAME }),
      description: t("description"),
      type: "website",
      url: `${base}/${locale}`,
      siteName: env().PRODUCT_NAME,
      locale,
    },
  };
}

/** Questions fréquentes, dans l'ordre (textes : home.faq.items.<clé>). */
const FAQ = [
  "basic",
  "setup",
  "creation",
  "commitment",
  "cancel",
  "prices",
  "domain",
  "quotas",
  "change",
  "support",
  "data",
  "solutions",
  "ai",
  "tablet",
] as const;

/** Fonctions d'IA : la question de la FAQ à leur sujet ne s'affiche que si l'une est encore « Bientôt ». */
const AI_FEATURES = ["aiChatbot", "aiTexts", "aiImages", "whatsappAssistant"];

/** Pictogramme de chaque métier visé (clés de `solutions.items.*.targets`). */
const TARGET_ICONS: Record<string, typeof CheckLine> = {
  beauty: SparkleLine,
  hair: ScissorsLine,
  wellness: LeafLine,
  garage: WrenchLine,
  craft: HammerLine,
  consulting: BriefcaseLine,
  events: PartyLine,
  artists: PaletteLine,
  bakery: BreadLine,
  liberal: ScaleLine,
  coaching: AwardLine,
  photo: CameraLine,
  shops: StoreLine,
  makers: PaletteLine,
  food: ForkKnifeLine,
  trainers: CapLine,
  experts: BriefcaseLine,
  organizations: UsersLine,
  courseCreators: PlayLine,
};

/** Pictogrammes du bandeau de fonctions de chaque solution (dans l'ordre des textes). */
const STRIP: Record<Solution, (typeof CheckLine)[]> = {
  booking: [ClockLine, BellLine, CardLine, CalendarLine, UsersLine, ChartLine],
  commerce: [StoreLine, BoxLine, LockLine, FileLine, TagLine, GiftLine],
  formation: [PlayLine, FileLine, CapLine, AwardLine, TrendLine, CardLine],
};

/** Pictogrammes des quatre usages de l'espace de gestion (dans l'ordre des textes). */

/** « Pour aller plus loin » : seulement ce que les cartes des solutions ne présentent pas déjà. */
const BENEFITS = [
  { key: "marketing", Icon: MegaphoneLine },
  { key: "reviews", Icon: StarLine },
  { key: "dataExport", Icon: DownloadLine },
  { key: "automation", Icon: RefreshLine, feature: "marketingAutomation" },
  { key: "assistant", Icon: SparkleLine, feature: "aiChatbot" },
] as const;

const TITLE = "font-display font-semibold tracking-[-0.025em] text-night";

/** Point corail devant les badges de section : le rappel du point du « o » de la marque. */
const EYEBROW_DOT = <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-coral" />;

/** Titre dont le point final passe en corail, comme le point du logo. */
function coralStop(text: string) {
  if (!text.endsWith(".")) return text;
  return (
    <>
      {text.slice(0, -1)}
      <span className="text-coral">.</span>
    </>
  );
}
const EYEBROW =
  "inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[0.875rem] font-medium uppercase tracking-[0.08em] text-accent-strong";
const PRIMARY =
  "hn-shine group inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[1.0625rem] font-medium text-white shadow-[0_12px_24px_-14px_var(--accent)] transition hover:-translate-y-px hover:bg-accent-strong motion-reduce:transition-none";
const SECONDARY =
  "inline-flex min-h-12 items-center gap-2 rounded-xl border border-hairline bg-white px-5 text-[1.0625rem] font-medium text-night transition hover:border-accent-line hover:text-accent-strong";

/**
 * Site commercial : « Votre agenda se remplit. Vous, vous travaillez. »
 * Une marque, trois solutions (Réservation, Commerce, Formation) qui
 * partagent les mêmes packs (Starter, Pro, Business). Le choix d'une solution
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
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    yearly: {
      enabled: Boolean(await getPlatformSetting(tx, "yearly_billing_enabled")),
      freeMonths: Number(await getPlatformSetting(tx, "yearly_free_months")),
    },
    warningPercent: Number(await getPlatformSetting(tx, "sms_warning_percent")),
    goLiveDays: Number(await getPlatformSetting(tx, "go_live_delay_days")),
    soon: await getPlatformSetting(tx, "features_soon"),
    solutions: await getPlatformSetting(tx, "solutions"),
    demoUrl: String(await getPlatformSetting(tx, "demo_url")),
    offers: await listLaunchOffers(tx, { openOnly: true }),
  }));
  const soon = new Set<string>(data.soon);
  const isSoon = (solution: Solution) =>
    data.solutions.find((item) => item.code === solution)?.status !== "available";
  // Premier pack de la grille (le moins cher) : bouton « Créer mon site » et question de la FAQ.
  const first = [...data.plans].sort((a, b) => a.priceCents - b.priceCents)[0];
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const startHref = { pathname: "/commander" as const, query: first ? { pack: first.code } : {} };

  const faqValues = {
    months: data.commitment,
    display: data.display,
    days: data.goLiveDays,
    email: contact,
    percent: data.warningPercent,
    product: config.PRODUCT_NAME,
    plan: first ? pickLocalized(first.name, locale) : "",
    price: first ? formatMoney(first.priceCents, first.currency, locale) : "",
    free: first && first.priceCents <= 0 ? "yes" : "no",
    // -1 : illimité (quota absent).
    bookings: first ? (first.limits.onlineBookingsPerMonth ?? -1) : 0,
    customers: first ? (first.limits.customers ?? -1) : 0,
    tablet: data.offers.length > 0 ? "yes" : "no",
  };
  // Questions affichées seulement quand elles s'appliquent : outils d'IA encore annoncés
  // « Bientôt », offre de lancement ouverte.
  const aiSoon = AI_FEATURES.some((key) => soon.has(key));
  const hasOffer = data.offers.length > 0;
  const faq = FAQ.filter((key) => (key === "ai" ? aiSoon : key === "tablet" ? hasOffer : true)).map(
    (key) => ({
      key,
      q: t(`faq.items.${key}.q`, faqValues),
      a: t(`faq.items.${key}.a`, faqValues),
    }),
  );
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: config.PRODUCT_NAME,
      url: publicAppUrl(),
      logo: `${publicAppUrl()}/icon.svg`,
      email: contact,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: config.PRODUCT_NAME,
      url: `${publicAppUrl()}/${locale}`,
      inLanguage: locale,
    },
    // Logiciel et prix des packs en vente (réglages), mensuels.
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: config.PRODUCT_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: data.plans.map((plan) => ({
        "@type": "Offer",
        name: pickLocalized(plan.name, locale),
        price: (plan.priceCents / 100).toFixed(2),
        priceCurrency: plan.currency,
        url: `${publicAppUrl()}/${locale}#tarifs`,
      })),
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
    <div className="bg-white text-[1.0625rem] font-normal leading-[1.65] text-[#3d4457]">
      <script
        type="application/ld+json"
        // Le « < » est échappé : le texte ne peut pas fermer la balise.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <PlatformHeader />
      <RevealOnScroll />
      <main id="contenu" className="overflow-x-clip">
        <SolutionScope>
          {/* Accroche */}
          <section className="relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(60rem_26rem_at_50%_-6rem,var(--accent-soft),transparent_70%)]"
            />
            {/* Halos qui dérivent lentement derrière l'accroche. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
            >
              <div className="hn-drift absolute -left-24 top-10 size-[24rem] rounded-full bg-accent/15 blur-[90px] max-sm:size-[16rem]" />
              <div className="hn-drift-slow absolute -right-20 top-32 size-[22rem] rounded-full bg-champagne/25 blur-[90px] max-sm:size-[14rem]" />
            </div>
            <div className="relative mx-auto grid max-w-[75rem] items-center gap-10 px-4 pb-12 pt-6 sm:px-6 sm:pt-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:pb-16 lg:pt-16 2xl:max-w-[88rem]">
              <div>
                {/* Petite annonce : une ligne, casse normale, point lumineux. */}
                <p className="hn-up inline-flex max-w-full items-center gap-2.5 rounded-full border border-hairline bg-white/80 py-1.5 pl-2.5 pr-4 text-mk-note font-medium text-night shadow-[0_6px_18px_-12px_rgba(15,24,48,.35)] backdrop-blur">
                  <span aria-hidden="true" className="relative flex size-2 flex-none">
                    <span className="hn-ping absolute inset-0 rounded-full bg-coral" />
                    <span className="relative size-2 rounded-full bg-coral" />
                  </span>
                  <span className="truncate">{t("hero.badge")}</span>
                </p>
                {/* Sur téléphone, le titre suit la largeur de l'écran : une phrase par ligne. */}
                <h1
                  className={`${TITLE} hn-balance hn-up-2 mt-5 text-[clamp(1.5rem,7.6vw,2.25rem)] leading-[1.08] sm:text-mk-h1 sm:leading-[1.04]`}
                >
                  {t("hero.title")} <span className="hn-shimmer block">{t("hero.titleAccent")}</span>
                </h1>
                <p className="hn-up-3 mt-4 max-w-[34rem] text-mk-lead leading-normal text-ink-soft sm:mt-5 sm:leading-relaxed">
                  {t("hero.subtitle")}
                </p>
                <div className="hn-up-4 mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
                  <Link href={startHref} className={`${PRIMARY} justify-center`}>
                    {t("cta")}
                    <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  {/* Prix d'entrée et délai de mise en ligne (réglages), juste sous le bouton sur téléphone. */}
                  {first && (
                    <p className="-mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-mk-small text-ink-soft sm:hidden">
                      <span className="font-medium text-night">
                        {t("hero.offer", { price: faqValues.price, display: data.display })}
                      </span>
                      {data.goLiveDays > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{t("hero.goLive", { days: data.goLiveDays })}</span>
                        </>
                      )}
                    </p>
                  )}
                  {/* La démonstration n'apparaît que si une adresse est réglée dans l'admin.
                      Sur téléphone, l'action secondaire est un simple lien : un seul gros bouton. */}
                  {data.demoUrl ? (
                    <a
                      href={data.demoUrl}
                      target="_blank"
                      rel="noopener"
                      className={`${SECONDARY} justify-center max-sm:min-h-11 max-sm:border-0 max-sm:bg-transparent max-sm:text-accent-strong`}
                    >
                      <PlayCircleLine className="size-[18px] text-accent" />
                      {t("hero.demo")}
                    </a>
                  ) : (
                    <a
                      href="#tarifs"
                      className={`${SECONDARY} justify-center max-sm:min-h-11 max-sm:border-0 max-sm:bg-transparent max-sm:text-accent-strong`}
                    >
                      {t("hero.pricing")}
                      <ArrowLine className="size-4 sm:hidden" />
                    </a>
                  )}
                </div>
                {/* Prix d'entrée et délai de mise en ligne, tirés des réglages. */}
                {first && (
                  <p className="hn-up-4 mt-4 hidden flex-wrap items-center gap-x-2 gap-y-1 text-mk-small text-ink-soft sm:flex">
                    <span className="font-medium text-night">
                      {t("hero.offer", { price: faqValues.price, display: data.display })}
                    </span>
                    {data.goLiveDays > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t("hero.goLive", { days: data.goLiveDays })}</span>
                      </>
                    )}
                  </p>
                )}
                <ul className="hn-up-4 mt-7 hidden flex-wrap gap-x-5 gap-y-2 text-mk-small text-ink-soft sm:flex">
                  {(t.raw("hero.points") as string[]).map((point) => (
                    <li key={point} className="flex items-center gap-2">
                      <span className="flex size-5 flex-none items-center justify-center rounded-full bg-accent-soft text-accent">
                        <CheckLine className="size-3" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Vraie capture de l'espace sur téléphone (données d'exemple), deux notifications qui flottent. */}
              <div className="hn-up-3 relative mx-auto w-full max-w-[24rem] lg:max-w-[28rem]">
                <div
                  aria-hidden="true"
                  className="absolute inset-x-6 top-10 bottom-6 rounded-[3rem] bg-[radial-gradient(closest-side,var(--accent),transparent)] opacity-20 blur-3xl"
                />
                <div className="relative mx-auto w-[14rem] sm:w-[17rem] lg:w-[18.5rem]">
                  <div className="rounded-[2.6rem] border border-[#2a3043] bg-[#1d2333] p-2 shadow-[0_40px_70px_-30px_rgba(15,24,48,.6)]">
                    <Image
                      src="/images/espace-telephone.webp"
                      width={780}
                      height={1688}
                      alt={t("hero.visualAlt")}
                      priority
                      sizes="(min-width: 1024px) 18.5rem, (min-width: 640px) 17rem, 14rem"
                      className="h-auto w-full rounded-[2.1rem]"
                    />
                  </div>
                </div>
                <div className="hn-float absolute left-0 top-[14%] flex items-center gap-3 rounded-2xl border border-hairline bg-white/95 py-2.5 pl-2.5 pr-4 shadow-[0_18px_36px_-20px_rgba(15,24,48,.5)] backdrop-blur sm:-left-4">
                  <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <CalendarLine className="size-[18px]" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-mk-small font-medium text-night">
                      {t("hero.float.bookingTitle")}
                    </span>
                    <span className="block text-mk-note text-ink-soft">{t("hero.float.bookingText")}</span>
                  </span>
                </div>
                <div className="hn-float-late absolute right-0 top-[58%] flex items-center gap-3 rounded-2xl border border-hairline bg-white/95 py-2.5 pl-2.5 pr-4 shadow-[0_18px_36px_-20px_rgba(15,24,48,.5)] backdrop-blur sm:-right-4">
                  <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-[#e7f6ee] text-[#1f7a4d]">
                    <BellLine className="size-[18px]" />
                  </span>
                  <span className="leading-tight">
                    <span className="block text-mk-small font-medium text-night">
                      {t("hero.float.reminderTitle")}
                    </span>
                    <span className="block text-mk-note text-ink-soft">{t("hero.float.reminderText")}</span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Choisissez votre solution */}
          <section id="solutions" aria-labelledby="titre-solutions" className="scroll-mt-20 px-4 sm:px-6">
            <div className="mx-auto max-w-[72rem] 2xl:max-w-[85rem]">
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
                    <div data-reveal>
                      <p className={EYEBROW}>
                        {EYEBROW_DOT}
                        {t(`solutions.items.${code}.badge`)}
                        {isSoon(code) && (
                          <span className="rounded-full bg-white px-2 py-px text-mk-note normal-case tracking-normal text-ink-soft">
                            {t("solutions.soon")}
                          </span>
                        )}
                      </p>
                      <h3 className={`${TITLE} hn-balance mt-4 text-mk-h2 leading-[1.1]`}>
                        {t(`solutions.items.${code}.title`)}
                        <br />
                        <span className="text-accent">
                          {coralStop(t(`solutions.items.${code}.titleAccent`))}
                        </span>
                      </h3>
                      <p className="mt-4 max-w-[32rem] text-mk-lead text-ink-soft">
                        {t(`solutions.items.${code}.text`)}
                      </p>
                      {/* Métiers visés, chacun avec son pictogramme : le visiteur repère le sien d'un coup d'œil. */}
                      <p className="mt-6 text-mk-small font-medium text-night">
                        {t(`solutions.items.${code}.targetsTitle`)}
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("solutions.for")}>
                        {Object.entries(
                          t.raw(`solutions.items.${code}.targets`) as Record<string, string>,
                        ).map(([key, label]) => {
                          const Icon = TARGET_ICONS[key] ?? CheckLine;
                          return (
                            <li
                              key={key}
                              className="group inline-flex items-center gap-2 rounded-full border border-accent-line/60 bg-accent-soft/60 py-1.5 pl-2 pr-3.5 text-mk-small font-medium text-night transition-colors duration-300 hover:border-coral/40 hover:bg-coral/10 hover:text-coral-dark"
                            >
                              <span className="flex size-6 flex-none items-center justify-center rounded-full bg-white text-accent transition-colors duration-300 group-hover:text-coral-dark">
                                <Icon className="size-3.5" />
                              </span>
                              {label}
                            </li>
                          );
                        })}
                      </ul>
                      {isSoon(code) ? (
                        <div className="mt-7">
                          <Link href={{ pathname: "/rappel", query: { solution: code } }} className={PRIMARY}>
                            {t("solutions.ctaSoon")}
                            <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          <p className="mt-3 max-w-[30rem] text-[0.9375rem] text-ink-soft">
                            {t("solutions.soonNote")}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-7 flex flex-wrap gap-3">
                          <Link href={startHref} className={PRIMARY}>
                            {t("cta")}
                            <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                          </Link>
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
                      )}
                    </div>
                    <div data-reveal>
                      <SolutionVisual solution={code} />
                    </div>
                  </div>

                  {/* Fonctions de la solution : chaque information une seule fois, avec son bénéfice
                      et, s'il y a lieu, le pack qui la débloque. */}
                  <ul className="mt-8 grid overflow-hidden rounded-2xl border border-hairline bg-white max-sm:divide-y max-sm:divide-hairline sm:mt-10 sm:gap-3 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:grid-cols-2 lg:mt-12 lg:grid-cols-3 lg:gap-4">
                    {(
                      t.raw(`solutions.items.${code}.strip`) as {
                        title: string;
                        text: string;
                        tag?: string;
                      }[]
                    ).map((item, index) => {
                      const Icon = STRIP[code][index] ?? CheckLine;
                      return (
                        <li
                          key={item.title}
                          data-reveal
                          className="group flex items-start gap-3.5 px-4 py-3.5 transition duration-300 motion-reduce:transition-none sm:gap-4 sm:rounded-2xl sm:border sm:border-hairline sm:bg-white sm:p-4 sm:shadow-[0_1px_2px_rgba(15,24,48,.04)] sm:hover:-translate-y-1 sm:hover:border-coral/40 sm:hover:shadow-[0_14px_30px_-18px_rgba(232,80,63,.45)] lg:p-5"
                        >
                          <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-accent-soft text-accent transition-colors duration-300 group-hover:bg-coral/10 group-hover:text-coral-dark sm:size-11">
                            <Icon className="size-5 sm:size-[1.375rem]" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-display text-mk-body font-semibold leading-snug text-night">
                              {item.title}
                            </span>
                            <span className="mt-1 block text-mk-small leading-snug text-ink-soft">
                              {item.text}
                            </span>
                            {item.tag && (
                              <span className="mt-1.5 inline-flex rounded-full bg-champagne-soft px-2.5 py-0.5 text-mk-note font-medium text-copper">
                                {item.tag}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Le tableau de bord (Réservation) : aperçu de l'espace de gestion. */}
          <section
            data-only="booking"
            aria-labelledby="titre-tableau"
            className="relative isolate px-4 pt-20 sm:px-6 lg:pt-28"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-40 -z-10 h-[40rem]">
              <div className="hn-drift absolute left-[10%] top-20 size-[26rem] rounded-full bg-accent/15 blur-[100px]" />
              <div className="hn-drift-slow absolute right-[8%] top-40 size-[22rem] rounded-full bg-champagne/25 blur-[100px]" />
            </div>
            <div className="mx-auto max-w-[72rem] 2xl:max-w-[85rem]">
              <div className="mx-auto max-w-[46rem] text-center">
                <p data-reveal className={EYEBROW}>
                  {EYEBROW_DOT}
                  {t("dashboard.badge")}
                </p>
                <h2
                  id="titre-tableau"
                  data-reveal
                  className={`${TITLE} hn-balance mt-4 text-mk-h2 leading-[1.1]`}
                >
                  {t("dashboard.title")}{" "}
                  <span className="block text-accent">{coralStop(t("dashboard.titleAccent"))}</span>
                </h2>
                <p data-reveal className="mt-4 text-mk-lead text-ink-soft">
                  {t("dashboard.text")}
                </p>
              </div>
              <figure data-reveal className="mt-10 lg:mt-12">
                <div className="rounded-[1.4rem] border border-hairline bg-white/70 p-1.5 shadow-[0_40px_90px_-40px_rgba(15,24,48,.45),0_0_0_1px_rgba(255,255,255,.6)_inset] backdrop-blur sm:p-2.5 lg:rounded-[1.8rem]">
                  <Image
                    src="/images/espace-de-gestion.webp"
                    width={2304}
                    height={1536}
                    alt={t("dashboard.alt")}
                    sizes="(min-width: 1536px) 85rem, (min-width: 1152px) 72rem, 100vw"
                    className="h-auto w-full rounded-[1rem] lg:rounded-[1.3rem]"
                  />
                </div>
                <figcaption className="mt-3 text-center text-[0.875rem] text-ink-soft">
                  {t("dashboard.note")}
                </figcaption>
              </figure>
            </div>
          </section>

          {/* Les bénéfices */}
          <section
            id="fonctionnalites"
            aria-labelledby="titre-benefices"
            className="mx-auto max-w-[75rem] 2xl:max-w-[88rem] scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-28"
          >
            <p data-reveal className={EYEBROW}>
              {EYEBROW_DOT}
              {t("benefits.badge")}
            </p>
            <h2
              id="titre-benefices"
              data-reveal
              className={`${TITLE} mt-4 max-w-[44rem] text-mk-h2 leading-[1.1]`}
            >
              {t("benefits.title")}{" "}
              <span className="text-accent">{coralStop(t("benefits.titleAccent"))}</span>
            </h2>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:gap-4">
              {BENEFITS.map((item) => {
                const later = "feature" in item && soon.has(item.feature);
                return (
                  <li
                    key={item.key}
                    data-reveal
                    className={`group flex items-start gap-4 rounded-2xl border border-hairline p-4 transition duration-300 motion-reduce:transition-none sm:max-lg:last:col-span-2 lg:col-span-2 lg:p-5 lg:[&:nth-child(n+4)]:col-span-3 ${later ? "bg-mist-50/60" : "bg-white shadow-[0_1px_2px_rgba(15,24,48,.04)] hover:-translate-y-1 hover:border-coral/40 hover:shadow-[0_14px_30px_-18px_rgba(232,80,63,.45)]"}`}
                  >
                    <span
                      className={`flex size-11 flex-none items-center justify-center rounded-xl transition-colors duration-300 ${later ? "bg-white text-ink-soft" : "bg-accent-soft text-accent group-hover:bg-coral/10 group-hover:text-coral-dark"}`}
                    >
                      <item.Icon className="size-[1.375rem]" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2 font-display text-mk-body font-semibold leading-snug text-night">
                        {t(`benefits.items.${item.key}.title`)}
                        {later && (
                          <span className="rounded-full bg-white px-2 py-px font-sans text-mk-note font-normal text-ink-soft">
                            {t("plans.soonTag")}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-mk-small leading-snug text-ink-soft">
                        {t(`benefits.items.${item.key}.text`)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Choisissez votre pack */}
          <section
            id="tarifs"
            aria-labelledby="titre-tarifs"
            className="relative isolate mx-auto max-w-[75rem] 2xl:max-w-[88rem] scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-28"
          >
            {/* Fond des packs : trame de points et halos doux de l'accent et du champagne. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-40 -z-10 h-[46rem] w-screen -translate-x-1/2 overflow-hidden"
            >
              <div className="hn-dots absolute inset-0" />
              <div className="hn-drift absolute left-[8%] top-24 size-[22rem] rounded-full bg-accent/10 blur-[90px]" />
              <div className="absolute left-1/2 top-10 -translate-x-1/2">
                <div className="hn-drift-slow size-[26rem] rounded-full bg-champagne/20 blur-[100px]" />
              </div>
            </div>
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4 lg:mb-12">
              <div data-reveal>
                <h2 id="titre-tarifs" className={`${TITLE} text-mk-h2 leading-[1.1]`}>
                  {t("plans.title")}
                  {SOLUTIONS.map((code) => (
                    <span key={code} data-only={code} className="text-accent">
                      {" "}
                      {t(`solutions.items.${code}.name`)}
                    </span>
                  ))}
                  <span className="text-coral">.</span>
                </h2>
                <p className="mt-2 max-w-[36rem] text-ink-soft">{t("plans.subtitle")}</p>
              </div>
              {/* Mensuel / Annuel : seulement si le paiement à l'année est proposé (réglage). */}
              {data.yearly.enabled ? (
                <BillingToggle
                  labels={{
                    group: t("plans.billingLabel"),
                    month: t("plans.billingMonth"),
                    year: t("plans.billingYear"),
                    badge:
                      data.yearly.freeMonths > 0
                        ? t("plans.billingBadge", { months: data.yearly.freeMonths })
                        : null,
                  }}
                />
              ) : (
                <p className="rounded-full bg-accent-soft px-3.5 py-1.5 text-[0.9375rem] font-medium text-accent-strong">
                  {t("plans.monthly", { display: data.display })}
                </p>
              )}
            </div>
            {/* Solution en préparation : les packs se souscrivent aujourd'hui pour la Réservation. */}
            {SOLUTIONS.filter(isSoon).map((code) => (
              <p
                key={code}
                data-only={code}
                className="mb-8 rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-[1.0625rem] text-accent-strong"
              >
                {t("plans.soonSolution", { solution: t(`solutions.items.${code}.name`) })}
              </p>
            ))}
            <PlanCards
              plans={data.plans}
              locale={locale}
              soon={data.soon}
              display={data.display}
              commitmentMonths={data.commitment}
              offers={data.offers}
              yearly={data.yearly}
            />
            <p className="mt-6 text-center text-[0.9375rem] text-ink-soft">{t("plans.quotaNote")}</p>
          </section>
        </SolutionScope>

        {/* Questions */}
        <section
          id="questions"
          aria-labelledby="titre-questions"
          className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28"
        >
          <div className="mx-auto grid max-w-[72rem] 2xl:max-w-[85rem] gap-8 lg:grid-cols-[1fr_2fr] lg:gap-14">
            <div data-reveal>
              <h2 id="titre-questions" className={`${TITLE} text-mk-h2 leading-[1.1]`}>
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
            <div data-reveal className="divide-y divide-hairline border-y border-hairline">
              {faq.map((item, index) => (
                <details key={item.key} open={index === 0} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <PlusLine className="size-5 flex-none text-coral transition-transform group-open:rotate-45 motion-reduce:transition-none" />
                  </summary>
                  <p className="pb-5 pr-8 text-[1.0625rem] text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Bandeau final : carte claire nacrée, pour trancher avec le pied de page sombre. */}
        <section className="px-4 pb-16 sm:px-6 lg:pb-24">
          <div
            data-reveal
            className="relative mx-auto max-w-[72rem] overflow-hidden rounded-[1.75rem] border border-champagne/50 bg-[linear-gradient(160deg,#ffffff,#fbf6ec_55%,#f5ecda)] px-6 py-12 text-center shadow-[0_30px_60px_-40px_rgba(27,42,74,0.45)] sm:py-14 lg:py-16 2xl:max-w-[85rem]"
          >
            <div
              aria-hidden="true"
              className="hn-drift pointer-events-none absolute -left-16 -top-24 size-80 rounded-full bg-[#5b6fd6]/10 blur-[80px]"
            />
            <div
              aria-hidden="true"
              className="hn-drift-slow pointer-events-none absolute -bottom-24 -right-10 size-80 rounded-full bg-champagne/40 blur-[80px]"
            />
            <p className="relative inline-flex flex-col items-center gap-0.5 rounded-2xl border border-champagne/60 bg-white/80 px-4 py-1.5 text-mk-small font-medium text-navy sm:flex-row sm:gap-2 sm:rounded-full">
              <span className="inline-flex items-center gap-2">
                {EYEBROW_DOT}
                {t("hero.offer", { price: faqValues.price, display: data.display })}
              </span>
              {data.goLiveDays > 0 && (
                <>
                  <span aria-hidden="true" className="hidden text-champagne sm:inline">
                    ·
                  </span>
                  <span>{t("hero.goLive", { days: data.goLiveDays })}</span>
                </>
              )}
            </p>
            <h2 className="relative mx-auto mt-5 max-w-[40rem] font-display text-mk-h2 font-semibold tracking-[-0.025em] text-night">
              {t("final.title")}
            </h2>
            <p className="relative mx-auto mt-3 max-w-[32rem] text-[1.0625rem] text-ink-soft">
              {t("final.text")}
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={startHref}
                className="hn-shine group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-navy px-6 text-[1.0625rem] font-medium text-white shadow-[0_14px_28px_-14px_rgba(27,42,74,0.8)] transition hover:-translate-y-px hover:bg-navy-light motion-reduce:transition-none sm:w-auto"
              >
                {t("final.cta")}
                <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href={{ pathname: "/", hash: "tarifs" }}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl px-5 text-[1.0625rem] font-medium text-navy underline-offset-4 transition hover:underline"
              >
                {t("hero.pricing")}
              </Link>
            </div>
            <ul className="relative mx-auto mt-8 flex w-fit flex-col items-start gap-x-6 gap-y-2 text-mk-small text-ink-soft sm:flex-row sm:flex-wrap sm:justify-center">
              {(t.raw("hero.points") as string[]).map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <span className="flex size-5 flex-none items-center justify-center rounded-full bg-navy/10 text-navy">
                    <CheckLine className="size-3" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
