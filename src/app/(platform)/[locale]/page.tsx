import type { Metadata } from "next";
import type { PlanFeatures } from "@/db/schema";
import { pickLocalized } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import { ttcHintCents } from "@/modules/billing/vat";
import Image from "next/image";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SirineMark } from "@/components/brand/Logo";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import {
  ArrowLine,
  BellLine,
  BoxLine,
  CalendarLine,
  GlobeLine,
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
  MessageLine,
  RefreshLine,
  SparkleLine,
  StoreLine,
  TagLine,
  TrendLine,
  UsersLine,
  AwardLine,
  CapLine,
  BriefcaseLine,
  CameraLine,
  ForkKnifeLine,
  HammerLine,
  LeafLine,
  PaletteLine,
  PartyLine,
  PercentLine,
  ScaleLine,
  ScissorsLine,
  WrenchLine,
} from "@/components/marketing/line-icons";
import { AllFeatures } from "@/components/marketing/AllFeatures";
import { TestimonialCard } from "@/components/marketing/TestimonialCard";
import { PlanCards } from "@/components/marketing/PlanCards";
import { RevealOnScroll } from "@/components/marketing/RevealOnScroll";
import { RotatingWord } from "@/components/marketing/RotatingWord";
import { TargetsMarquee } from "@/components/marketing/TargetsMarquee";
import { BillingToggle, SolutionScope, SolutionTabs } from "@/components/marketing/SolutionScope";
import { SolutionVisual } from "@/components/marketing/SolutionVisual";
import { listShowcase } from "@/modules/showcase/showcase";
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
    title: { absolute: t("title", { product: env().PRODUCT_NAME }) },
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
  lessons: CapLine,
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

/** Tuiles des fonctionnalités : une icône et quelques mots, toutes présentées de la même façon. */
const FEATURE_TILES = [
  { key: "catalog", Icon: TagLine, label: "" },
  { key: "photos", Icon: CameraLine, label: "selfService.items.photos.title" },
  { key: "logo", Icon: PaletteLine, label: "selfService.items.logo.title" },
  { key: "texts", Icon: FileLine, label: "selfService.items.texts.title" },
  { key: "hours", Icon: ClockLine, label: "selfService.items.hours.title" },
  { key: "testimonials", Icon: StarLine, label: "selfService.items.testimonials.title" },
  { key: "promotions", Icon: PercentLine, label: "selfService.items.promotions.title" },
  { key: "marketing", Icon: MegaphoneLine, label: "benefits.items.marketing.title" },
  { key: "reviews", Icon: StarLine, label: "benefits.items.reviews.title" },
  { key: "dataExport", Icon: DownloadLine, label: "benefits.items.dataExport.title" },
] as const;

const TITLE = "font-display font-semibold tracking-[-0.025em] text-night";

/** Point corail devant les badges de section : le rappel du point du « o » de la marque. */
const EYEBROW_DOT = <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-coral" />;

/** Titre dont le point (ou le point d'interrogation) final passe en corail, comme le point du logo. */
function coralStop(text: string) {
  const stop = text.at(-1);
  if (stop !== "." && stop !== "?") return text;
  return (
    <>
      {text.slice(0, -1)}
      <span className="text-coral">{stop}</span>
    </>
  );
}
const EYEBROW =
  "inline-flex items-center gap-2 rounded-full bg-coral/10 px-3 py-1 text-[0.875rem] font-medium uppercase tracking-[0.08em] text-coral-dark";
const PRIMARY =
  "hn-shine group inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-[1.0625rem] font-medium text-white shadow-[0_12px_24px_-14px_var(--accent)] transition hover:-translate-y-px hover:bg-accent-strong motion-reduce:transition-none";
/** Accroche sur fond bleu nuit : bouton principal au dégradé du logo, secondaire translucide. */
const HERO_PRIMARY = `${PRIMARY} bg-[linear-gradient(120deg,var(--color-violet),var(--color-azure-dark))] shadow-[0_16px_36px_-14px_rgba(91,90,255,.85)]`;
const HERO_SECONDARY =
  "inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-5 text-[1.0625rem] font-medium text-white backdrop-blur transition hover:border-white/40 hover:bg-white/10";
/** Couleur claire des liens et coches sur fond bleu nuit (lavande du logo). */
const ON_DARK_ACCENT = "text-[#b7a6ff]";

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
    vatPercent: Number(await getPlatformSetting(tx, "vat_rate_percent")),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    noCommitment: Boolean(await getPlatformSetting(tx, "offer_no_commitment")),
    yearly: {
      enabled: Boolean(await getPlatformSetting(tx, "yearly_billing_enabled")),
      freeMonths: Number(await getPlatformSetting(tx, "yearly_free_months")),
    },
    warningPercent: Number(await getPlatformSetting(tx, "sms_warning_percent")),
    goLiveDays: Number(await getPlatformSetting(tx, "go_live_delay_days")),
    trialDays: Number(await getPlatformSetting(tx, "trial_days")),
    soon: await getPlatformSetting(tx, "features_soon"),
    solutions: await getPlatformSetting(tx, "solutions"),
    demoUrl: String(await getPlatformSetting(tx, "demo_url")),
    offers: await listLaunchOffers(tx, { openOnly: true }),
    showcase: await listShowcase(tx),
  }));
  const soon = new Set<string>(data.soon);
  const statusOf = (solution: Solution) => data.solutions.find((item) => item.code === solution)?.status;
  const isSoon = (solution: Solution) => statusOf(solution) !== "available";
  // Solutions présentées sur la page : celles en pause (réglage admin) n'apparaissent nulle part.
  const shown = SOLUTIONS.filter((code) => statusOf(code) !== "hidden");
  const soonShown = shown.filter(isSoon);
  // Premier pack de la grille (le moins cher) : bouton « Créer mon site » et question de la FAQ.
  const first = [...data.plans].sort((a, b) => a.priceCents - b.priceCents)[0];
  // Prix d'entrée TTC, en petit à côté du prix HT (seulement si les prix sont affichés HT avec TVA).
  const firstTtcCents = first ? ttcHintCents(first.priceCents, data.display, data.vatPercent) : null;
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const startHref = { pathname: "/commander" as const, query: first ? { pack: first.code } : {} };
  // Nom du premier pack qui inclut une fonction (« Dès le pack … ») ; « none » si le premier
  // pack l'inclut déjà ou si aucun ne l'inclut.
  const firstPlanWith = (feature: keyof PlanFeatures) => {
    if (!first || first.features[feature]) return "none";
    const plan = [...data.plans]
      .sort((a, b) => a.priceCents - b.priceCents)
      .find((item) => item.features[feature]);
    return plan ? pickLocalized(plan.name, locale) : "none";
  };

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
    // Formule sans engagement proposée à côté de l'engagement (réglage admin).
    choice: data.noCommitment ? "yes" : "no",
    // Premier pack (le moins cher) qui inclut un nom de domaine pour la création.
    exportPlan: firstPlanWith("dataExport"),
    // Solutions présentées « Bientôt » (question de la FAQ).
    soonCount: soonShown.length,
    soonNames: new Intl.ListFormat(locale, { type: "conjunction" }).format(
      soonShown.map((code) => t(`solutions.items.${code}.name`)),
    ),
    domainPlan: (() => {
      const plan = [...data.plans]
        .sort((a, b) => a.priceCents - b.priceCents)
        .find((item) => item.features.freeDomain);
      return plan ? pickLocalized(plan.name, locale) : "none";
    })(),
  };
  // Questions affichées seulement quand elles s'appliquent : outils d'IA encore annoncés
  // « Bientôt », offre de lancement ouverte.
  const aiSoon = AI_FEATURES.some((key) => soon.has(key));
  const hasOffer = data.offers.length > 0;
  // « Commerce est-il disponible ? » : tant qu'une solution présentée est en préparation.
  const solutionSoon = soonShown.length > 0;
  const faq = FAQ.filter((key) =>
    key === "ai" ? aiSoon : key === "tablet" ? hasOffer : key === "solutions" ? solutionSoon : true,
  ).map((key) => ({
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
      logo: `${publicAppUrl()}/brand/app-icon-512.png`,
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
          {/* Accroche : fond bleu nuit du logo, arcs lumineux violet → bleu. */}
          <section className="relative overflow-hidden bg-deep text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_28rem_at_15%_-10%,rgba(123,63,228,.35),transparent_70%),radial-gradient(46rem_26rem_at_95%_105%,rgba(47,128,255,.28),transparent_70%)]"
            />
            {/* Arcs fins, comme sur le logo. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-[22rem] -top-[30rem] size-[52rem] rounded-full border border-violet/60 shadow-[0_0_60px_rgba(123,63,228,.35)] max-sm:-left-[30rem]" />
              <div className="absolute -bottom-[34rem] -right-[24rem] size-[56rem] rounded-full border border-azure/60 shadow-[0_0_60px_rgba(47,128,255,.3)] max-sm:-right-[34rem]" />
            </div>
            {/* Halos qui dérivent lentement derrière l'accroche. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
            >
              <div className="hn-drift absolute -left-24 top-10 size-[24rem] rounded-full bg-accent/15 blur-[90px] max-sm:size-[16rem]" />
              <div className="hn-drift-slow absolute -right-20 top-32 size-[22rem] rounded-full bg-champagne/25 blur-[90px] max-sm:size-[14rem]" />
              <div className="hn-drift absolute right-[22%] top-[26rem] size-[18rem] rounded-full bg-coral/10 blur-[90px] max-sm:right-0 max-sm:top-[34rem] max-sm:size-[12rem]" />
            </div>
            <div className="relative mx-auto grid max-w-[75rem] items-center gap-10 px-4 pb-12 pt-6 sm:px-6 sm:pt-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:pb-10 lg:pt-10 2xl:max-w-[88rem]">
              <div>
                {/* Petite annonce : une ligne, casse normale, point lumineux. */}
                <p className="hn-up inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.06] py-1.5 pl-2.5 pr-4 text-mk-note font-medium text-white/90 backdrop-blur">
                  <span aria-hidden="true" className="relative flex size-2 flex-none">
                    <span className="hn-ping absolute inset-0 rounded-full bg-coral" />
                    <span className="relative size-2 rounded-full bg-coral" />
                  </span>
                  <span className="truncate">{t("hero.badge")}</span>
                </p>
                {/* Sur téléphone, le titre suit la largeur de l'écran : une phrase par ligne. */}
                <h1
                  className={`${TITLE} hn-up-2 mt-5 text-[clamp(2rem,10.5vw,2.75rem)] leading-[1.06] !text-white [--color-accent:#6f8dff] [--color-accent-strong:#8fb0ff] [--color-coral:#b08cff] sm:text-mk-h1 sm:leading-[1.04]`}
                >
                  {/* La fin du titre change toute seule (institut, salon…) ; titre complet pour les lecteurs d'écran. */}
                  <span aria-hidden="true" className="hn-balance block">
                    {t("hero.title")}
                  </span>
                  <RotatingWord words={t.raw("hero.titleWords") as string[]} />
                  <span className="sr-only">
                    {t("hero.title")} {t("hero.titleAccent")}
                  </span>
                </h1>
                <p className="hn-up-3 mt-4 max-w-[34rem] text-mk-lead leading-normal text-white/70 sm:mt-5 sm:leading-relaxed">
                  {t("hero.subtitle")}
                </p>
                <div className="hn-up-4 mt-7 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
                  <Link href={startHref} className={`${HERO_PRIMARY} justify-center`}>
                    {t("cta")}
                    <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  {/* Sur téléphone, une seule ligne sous le bouton : prix d'entrée (réglages) et lien vers les tarifs. */}
                  {first && (
                    <a
                      href="#tarifs"
                      className="-mt-1 flex min-h-11 items-center justify-center gap-2 text-mk-small sm:hidden"
                    >
                      <span className="font-medium text-white">
                        {t("hero.offer", { price: faqValues.price, display: data.display })}
                      </span>
                      <span aria-hidden="true" className="text-white/50">
                        ·
                      </span>
                      <span className={`inline-flex items-center gap-1 font-medium ${ON_DARK_ACCENT}`}>
                        {t("hero.pricing")}
                        <ArrowLine className="size-4" />
                      </span>
                    </a>
                  )}
                  {/* La démonstration n'apparaît que si une adresse est réglée dans l'admin.
                      Sur téléphone, l'action secondaire est un simple lien : un seul gros bouton. */}
                  {data.demoUrl ? (
                    <a
                      href={data.demoUrl}
                      target="_blank"
                      rel="noopener"
                      className={`${HERO_SECONDARY} justify-center max-sm:min-h-11 max-sm:border-0 max-sm:bg-transparent`}
                    >
                      <PlayCircleLine className={`size-[18px] ${ON_DARK_ACCENT}`} />
                      {t("hero.demo")}
                    </a>
                  ) : (
                    <a
                      href="#tarifs"
                      className={`${HERO_SECONDARY} justify-center ${first ? "max-sm:hidden" : "max-sm:min-h-11 max-sm:border-0 max-sm:bg-transparent"}`}
                    >
                      {t("hero.pricing")}
                      <ArrowLine className="size-4 sm:hidden" />
                    </a>
                  )}
                </div>
                {/* Prix d'entrée et délai de mise en ligne, tirés des réglages. */}
                {first && (
                  <p className="hn-up-4 mt-4 hidden flex-wrap items-center gap-x-2 gap-y-1 text-mk-small text-white/60 sm:flex">
                    <span className="font-medium text-white">
                      {t("hero.offer", { price: faqValues.price, display: data.display })}
                    </span>
                    {firstTtcCents !== null && (
                      <span>
                        ({t("hero.offerTtc", { price: formatMoney(firstTtcCents, first.currency, locale) })})
                      </span>
                    )}
                    {data.goLiveDays > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{t("hero.goLive", { days: data.goLiveDays })}</span>
                      </>
                    )}
                  </p>
                )}
                <ul className="hn-up-4 mt-6 flex flex-col gap-3 text-mk-body text-white/85 sm:mt-8">
                  {(t.raw("hero.points") as string[]).map((point) => (
                    <li key={point} className="flex items-center gap-3">
                      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-violet),var(--color-azure-dark))] text-white shadow-[0_6px_16px_-6px_rgba(123,63,228,.9)]">
                        <CheckLine className="size-3.5" />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* L'application en vedette (aperçu, données d'exemple) : grand téléphone posé sur un
                  socle lumineux, empreinte du « S » derrière, notifications qui flottent autour. */}
              <div className="hn-up-3 relative mx-auto w-full max-w-[26rem] pb-14 sm:max-w-[30rem] lg:max-w-[34rem]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[45%] size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(123,63,228,.55),rgba(47,128,255,.18)_55%,transparent)] blur-2xl sm:size-[34rem]"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2"
                >
                  <SirineMark
                    onDark
                    sizes="(min-width: 1024px) 576px, (min-width: 640px) 480px, 384px"
                    className="hn-float-late size-[24rem] max-w-none opacity-30 sm:size-[30rem] lg:size-[36rem]"
                  />
                </div>
                {/* Socle lumineux sous le téléphone. */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-[4%] bottom-0 h-24">
                  <div className="absolute inset-x-0 bottom-0 h-20 rounded-[50%] bg-[linear-gradient(180deg,#2b2580,#0f0d3a_70%)] shadow-[0_-6px_40px_rgba(123,63,228,.55),0_20px_60px_rgba(5,8,30,.8)]" />
                  <div className="absolute inset-x-0 bottom-6 h-14 rounded-[50%] border-t-2 border-[#b79cff] bg-[linear-gradient(180deg,#3a2f9e,#1a1650)] shadow-[0_-2px_24px_rgba(183,156,255,.7)]" />
                </div>
                <div className="relative mx-auto w-[15rem] sm:w-[17rem] lg:w-[16.5rem] xl:w-[18rem] 2xl:w-[20rem]">
                  {/* Image du téléphone complet (cadre compris, fond transparent) : halo violet autour. */}
                  <Image
                    src="/images/accueil-telephone.webp"
                    width={860}
                    height={1756}
                    alt={t("hero.visualAlt")}
                    preload
                    sizes="(min-width: 1536px) 20rem, (min-width: 1280px) 18rem, (min-width: 1024px) 16.5rem, (min-width: 640px) 17rem, 15rem"
                    className="h-auto w-full drop-shadow-[0_0_40px_rgba(123,63,228,.55)]"
                  />
                </div>
                <div
                  className={`hn-float -left-1 top-[10%] sm:-left-6 lg:left-auto lg:-right-10 lg:top-[14%] absolute flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 py-2.5 pl-2.5 pr-5 shadow-[0_20px_40px_-18px_rgba(5,8,30,.75),0_0_0_1px_rgba(123,63,228,.08)] backdrop-blur`}
                >
                  <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-[#efeaff] text-violet">
                    <CalendarLine className="size-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="flex items-center gap-1.5 text-mk-small font-semibold text-night">
                      {t("hero.float.bookingTitle")}
                    </span>
                    <span className="flex items-center gap-1 text-mk-note text-ink-soft">
                      {t("hero.float.bookingText")}
                    </span>
                  </span>
                </div>
                <div
                  className={`hn-float-late max-sm:hidden lg:-right-14 lg:top-[38%] sm:-right-6 sm:top-[42%] absolute flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 py-2.5 pl-2.5 pr-5 shadow-[0_20px_40px_-18px_rgba(5,8,30,.75),0_0_0_1px_rgba(123,63,228,.08)] backdrop-blur`}
                >
                  <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-[#efeaff] text-violet">
                    <BellLine className="size-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="flex items-center gap-1.5 text-mk-small font-semibold text-night">
                      {t("hero.float.reminderTitle")}
                    </span>
                    <span className="flex items-center gap-1 text-mk-note text-ink-soft">
                      {t("hero.float.reminderText")}
                    </span>
                  </span>
                </div>
                <div
                  className={`hn-float -right-1 bottom-[22%] sm:-right-4 lg:-right-8 lg:bottom-[24%] absolute flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 py-2.5 pl-2.5 pr-5 shadow-[0_20px_40px_-18px_rgba(5,8,30,.75),0_0_0_1px_rgba(123,63,228,.08)] backdrop-blur`}
                >
                  <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-[#efeaff] text-violet">
                    <CardLine className="size-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="flex items-center gap-1.5 text-mk-small font-semibold text-night">
                      {t("hero.float.depositTitle")}
                    </span>
                    <span className="flex items-center gap-1 text-mk-note text-ink-soft">
                      {t("hero.float.depositText")} <CheckLine className="size-3.5 text-[#1f9d63]" />
                    </span>
                  </span>
                </div>
                <div
                  className={`hn-float-late max-lg:hidden -left-16 bottom-[18%] xl:-left-20 absolute flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 py-2.5 pl-2.5 pr-5 shadow-[0_20px_40px_-18px_rgba(5,8,30,.75),0_0_0_1px_rgba(123,63,228,.08)] backdrop-blur`}
                >
                  <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-[#efeaff] text-violet">
                    <GlobeLine className="size-5" />
                  </span>
                  <span className="leading-tight">
                    <span className="flex items-center gap-1.5 text-mk-small font-semibold text-night">
                      {t("hero.float.siteTitle")}
                    </span>
                    <span className="flex items-center gap-1 text-mk-note text-ink-soft">
                      {t("hero.float.siteText")}
                    </span>
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
                items={shown.map((code) => ({
                  code,
                  name: t(`solutions.items.${code}.name`),
                  short: t(`solutions.items.${code}.short`),
                  soon: isSoon(code),
                }))}
              />

              {shown.map((code) => (
                <div key={code} data-only={code} className="pt-10 lg:pt-14">
                  <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
                    <div data-reveal className="min-w-0">
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
                        <span className="hn-grad-text">
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
                      <div className="mt-3">
                        <TargetsMarquee
                          label={t("solutions.for")}
                          items={Object.entries(
                            t.raw(`solutions.items.${code}.targets`) as Record<string, string>,
                          ).map(([key, label]) => {
                            const Icon = TARGET_ICONS[key] ?? CheckLine;
                            return { key, label, icon: <Icon className="size-4" /> };
                          })}
                        />
                      </div>
                      {/* Solution disponible : pas de boutons ici, « Créer mon site » et « Voir les tarifs »
                          sont déjà dans l'accroche juste au-dessus. Solution annoncée : demande de rappel. */}
                      {isSoon(code) && (
                        <div className="mt-7">
                          <Link href={{ pathname: "/rappel", query: { solution: code } }} className={PRIMARY}>
                            {t("solutions.ctaSoon")}
                            <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                          </Link>
                          <p className="mt-3 max-w-[30rem] text-[0.9375rem] text-ink-soft">
                            {t("solutions.soonNote")}
                          </p>
                        </div>
                      )}
                    </div>
                    <div data-reveal>
                      <SolutionVisual solution={code} />
                    </div>
                  </div>

                  {/* Fonctions de la solution : chaque information une seule fois, avec son bénéfice
                      et, s'il y a lieu, le pack qui la débloque. */}
                  {/* Sur téléphone : une rangée de cartes qui se fait glisser (la suivante dépasse un peu). */}
                  {/* tabIndex : la rangée se fait aussi défiler au clavier (flèches). */}
                  <ul
                    aria-label={t("solutions.featuresLabel")}
                    tabIndex={0}
                    className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:mt-10 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:mt-12 lg:grid-cols-3 lg:gap-4"
                  >
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
                          className="group flex w-[80%] flex-none snap-start flex-col items-start gap-2.5 rounded-2xl border border-hairline bg-white p-4 shadow-[0_10px_24px_-18px_rgba(15,24,48,.35)] transition duration-300 motion-reduce:transition-none sm:w-auto sm:flex-row sm:gap-4 sm:p-4 sm:shadow-[0_1px_2px_rgba(15,24,48,.04)] sm:hover:-translate-y-1 sm:hover:border-coral/40 sm:hover:shadow-[0_14px_30px_-18px_rgba(232,80,63,.45)] lg:p-5"
                        >
                          <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-coral/10 text-coral-dark transition-colors duration-300 group-hover:bg-coral group-hover:text-white sm:size-11">
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

          {/* Exemple de site : maquette d'un établissement fictif (présentée comme un exemple par le titre). */}
          <section aria-labelledby="titre-exemple" className="px-4 pt-20 sm:px-6 lg:pt-28">
            <div className="mx-auto max-w-[72rem] 2xl:max-w-[85rem]">
              <div className="mx-auto max-w-[46rem] text-center">
                <p data-reveal className={EYEBROW}>
                  {EYEBROW_DOT}
                  {t("example.badge")}
                </p>
                <h2
                  id="titre-exemple"
                  data-reveal
                  className={`${TITLE} hn-balance mt-4 text-mk-h2 leading-[1.1]`}
                >
                  {t("example.title")}{" "}
                  <span className="hn-grad-text block">{coralStop(t("example.titleAccent"))}</span>
                </h2>
                <p data-reveal className="mt-4 text-mk-lead text-ink-soft">
                  {t("example.text")}
                </p>
              </div>
              <figure data-reveal className="mt-10 lg:mt-12">
                <div className="-mx-2 overflow-hidden rounded-[1rem] shadow-[0_40px_90px_-40px_rgba(15,24,48,.55)] sm:mx-0 sm:rounded-[1.2rem] lg:rounded-[1.8rem]">
                  <Image
                    src="/images/equipe-salon-sirine-v2.webp"
                    width={1672}
                    height={941}
                    alt={t("example.alt")}
                    sizes="(min-width: 1536px) 85rem, (min-width: 1152px) 72rem, 100vw"
                    className="h-auto w-full"
                  />
                </div>
              </figure>
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
              <div className="hn-drift-slow absolute right-[8%] top-40 size-[22rem] rounded-full bg-coral/10 blur-[100px]" />
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
                  <span className="hn-grad-text block">{coralStop(t("dashboard.titleAccent"))}</span>
                </h2>
                <p data-reveal className="mt-4 text-mk-lead text-ink-soft">
                  {t("dashboard.text")}
                </p>
              </div>
              <figure data-reveal className="mt-10 lg:mt-12">
                {/* La photo seule, sans cadre blanc autour : coins arrondis et ombre portée. */}
                <div className="-mx-2 overflow-hidden rounded-[1rem] shadow-[0_40px_90px_-40px_rgba(15,24,48,.55)] sm:mx-0 sm:rounded-[1.2rem] lg:rounded-[1.8rem]">
                  <Image
                    src="/images/espace-de-gestion-sirine.webp"
                    width={1672}
                    height={941}
                    alt={t("dashboard.alt")}
                    sizes="(min-width: 1536px) 85rem, (min-width: 1152px) 72rem, 100vw"
                    className="h-auto w-full"
                  />
                </div>
              </figure>
            </div>
          </section>

          {/* Choisissez votre pack : juste après l'aperçu de l'espace, pour voir les prix sans trop défiler. */}
          <section
            id="tarifs"
            aria-labelledby="titre-tarifs"
            className="relative isolate mx-auto max-w-[75rem] 2xl:max-w-[88rem] scroll-mt-20 px-4 pt-12 sm:px-6 sm:pt-16 lg:pt-20"
          >
            {/* Fond des packs : trame de points, halos et arcs lumineux violet → bleu du logo dans les coins. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[64rem] w-screen -translate-x-1/2 overflow-hidden"
            >
              <div className="hn-dots absolute inset-0 top-40" />
              <div className="hn-drift absolute left-[8%] top-48 size-[22rem] rounded-full bg-violet/10 blur-[90px]" />
              <div className="absolute left-1/2 top-32 -translate-x-1/2">
                <div className="hn-drift-slow size-[26rem] rounded-full bg-azure/10 blur-[100px]" />
              </div>
              <div className="absolute -left-[26rem] -top-[20rem] size-[40rem] rounded-full border-[3px] border-violet/40 shadow-[0_0_50px_rgba(123,63,228,.25)] max-sm:-left-[32rem]" />
              <div className="absolute -right-[28rem] top-[30rem] size-[44rem] rounded-full border-[3px] border-azure/40 shadow-[0_0_50px_rgba(47,128,255,.22)] max-sm:-right-[36rem]" />
            </div>
            {/* En-tête centré, comme la maquette : empreinte du logo, titre en dégradé, choix Mensuel / Annuel. */}
            <div className="mb-5 flex flex-col items-center gap-4 text-center sm:mb-8 lg:mb-10">
              <div data-reveal className="flex flex-col items-center">
                <SirineMark className="mb-3 size-10 drop-shadow-[0_10px_24px_rgba(123,63,228,.35)] sm:size-12 lg:size-14" />
                <h2 id="titre-tarifs" className={`${TITLE} hn-balance text-mk-h2 leading-[1.1]`}>
                  {t("plans.title")}
                  {shown.map((code) => (
                    <span key={code} data-only={code} className="hn-grad-text">
                      {" "}
                      {t(`solutions.items.${code}.name`)}
                    </span>
                  ))}
                  <span className="text-coral">.</span>
                </h2>
                <p className="mt-2 max-w-[36rem] text-mk-body text-ink-soft sm:mt-3 sm:text-mk-lead">
                  {t(shown.length > 1 ? "plans.subtitle" : "plans.subtitleSingle")}
                </p>
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
            {soonShown.map((code) => (
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
              vatPercent={data.vatPercent}
              commitmentMonths={data.commitment}
              noCommitment={data.noCommitment}
              offers={data.offers}
              yearly={data.yearly}
              trialDays={data.trialDays}
            />
            <p className="mt-6 text-center text-[0.9375rem] text-ink-soft">{t("plans.quotaNote")}</p>
          </section>

          {/* Fonctionnalités : une seule partie, peu de texte. Titre centré, puis des tuiles compactes
              (une icône et le nom de la fonction). Le détail complet se déplie en dessous. */}
          <section
            id="fonctionnalites"
            aria-labelledby="titre-fonctionnalites"
            className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-20 sm:px-6 lg:pt-28 2xl:max-w-[88rem]"
          >
            <div className="flex flex-col items-center text-center">
              <p data-reveal className={EYEBROW}>
                {EYEBROW_DOT}
                {t("benefits.badge")}
              </p>
              <h2
                id="titre-fonctionnalites"
                data-reveal
                className={`${TITLE} hn-balance mt-4 text-mk-h2 leading-[1.1]`}
              >
                {t("growth.title")} <span className="hn-grad-text">{coralStop(t("growth.titleAccent"))}</span>
              </h2>
              <p data-reveal className="mt-4 max-w-[34rem] text-mk-lead text-ink-soft">
                {t("growth.text")}
              </p>
            </div>
            <ul
              aria-label={t("benefits.badge")}
              className="mt-10 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:mt-12 lg:grid-cols-4"
            >
              {FEATURE_TILES.map((tile) => {
                return (
                  <li
                    key={tile.key}
                    data-reveal
                    className="group flex items-center gap-3 rounded-2xl border border-hairline bg-white p-3 transition duration-300 hover:-translate-y-0.5 hover:border-violet/30 hover:shadow-[0_16px_32px_-20px_rgba(91,70,240,.55)] motion-reduce:transition-none sm:gap-3.5 sm:p-4"
                  >
                    <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-violet),var(--color-azure-dark))] text-white shadow-[0_8px_18px_-8px_rgba(123,63,228,.8)] sm:size-10">
                      <tile.Icon className="size-[18px] sm:size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-semibold leading-snug text-night sm:text-mk-body">
                        {tile.key === "catalog"
                          ? shown.map((code) => (
                              <span key={code} data-only={code}>
                                {t(`selfService.items.catalog.${code}.title`)}
                              </span>
                            ))
                          : t(tile.label)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {/* Liste complète, repliée : pour celles qui veulent tous les détails. */}
            <AllFeatures plans={data.plans} soon={data.soon} shown={shown} />
          </section>

          {/* Témoignages réels saisis dans l'admin (section masquée s'il n'y en a pas). */}
          {data.showcase.length > 0 && (
            <section
              aria-labelledby="titre-temoignages"
              className="mx-auto max-w-[75rem] 2xl:max-w-[88rem] px-4 pt-20 sm:px-6 lg:pt-28"
            >
              <p data-reveal className={EYEBROW}>
                {EYEBROW_DOT}
                {t("showcase.badge")}
              </p>
              <h2
                id="titre-temoignages"
                data-reveal
                className={`${TITLE} mt-4 max-w-[44rem] text-mk-h2 leading-[1.1]`}
              >
                {t("showcase.title")}{" "}
                <span className="hn-grad-text">{coralStop(t("showcase.titleAccent"))}</span>
              </h2>
              <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {data.showcase.map((entry) => (
                  <li key={entry.id} data-reveal>
                    <TestimonialCard entry={entry} visitLabel={t("showcase.visit", { name: entry.name })} />
                  </li>
                ))}
              </ul>
              <p className="mt-6">
                <Link
                  href="/avis"
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium text-violet underline-offset-4 hover:underline"
                >
                  {t("showcase.allReviews")}
                  <ArrowLine className="size-4" />
                </Link>
              </p>
            </section>
          )}
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
                className="mt-4 inline-flex min-h-11 items-center font-medium text-navy underline decoration-coral decoration-2 underline-offset-4 transition-colors hover:text-coral-dark"
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

        {/* Bandeau final : carte compacte au dégradé du logo, les infos clés tirées des réglages
            (essai, prix d'entrée, délai, formule sans engagement) et deux actions. */}
        <section className="px-4 pb-16 sm:px-6 lg:pb-24">
          <div
            data-reveal
            className="relative mx-auto max-w-[72rem] overflow-hidden rounded-[1.75rem] bg-[linear-gradient(125deg,#5b2bd6,#7b3fe4_35%,#2563eb)] px-5 py-9 text-white shadow-[0_30px_60px_-30px_rgba(91,43,214,.7)] sm:px-10 sm:py-12 2xl:max-w-[85rem]"
          >
            <SirineMark
              onDark
              sizes="(min-width: 640px) 384px, 288px"
              className="pointer-events-none absolute -bottom-20 -right-16 size-72 opacity-20 sm:size-96"
            />
            <div
              aria-hidden="true"
              className="hn-drift pointer-events-none absolute -left-20 -top-28 size-80 rounded-full bg-white/15 blur-[80px]"
            />
            <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center lg:gap-12">
              <div>
                <h2 className="hn-balance font-display text-mk-h2 font-semibold leading-[1.1] tracking-[-0.025em] text-white">
                  {t("final.title")}
                </h2>
                <p className="mt-3 max-w-[34rem] text-[1.0625rem] leading-relaxed text-white/85">
                  {t("final.text")}
                </p>
                <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-mk-small font-medium sm:max-w-[40rem]">
                  {[
                    data.trialDays > 0 && {
                      key: "trial",
                      Icon: GiftLine,
                      text: t("plans.trial", { days: data.trialDays }),
                    },
                    first && {
                      key: "price",
                      Icon: TagLine,
                      text: t("hero.offer", { price: faqValues.price, display: data.display }),
                    },
                    data.goLiveDays > 0 && {
                      key: "golive",
                      Icon: ClockLine,
                      text: t("hero.goLive", { days: data.goLiveDays }),
                    },
                    data.noCommitment && { key: "free", Icon: CheckLine, text: t("final.noCommitment") },
                    // Inclus dès le premier pack seulement (fonctions des packs, réglées dans l'admin).
                    first?.features.maintenance && {
                      key: "updates",
                      Icon: RefreshLine,
                      text: t("final.updates"),
                    },
                    first?.features.whatsappSupport && {
                      key: "support",
                      Icon: MessageLine,
                      text: first.features.technicalSupport247 ? t("final.support247") : t("final.support"),
                    },
                  ]
                    .filter((item) => item !== false && item !== undefined)
                    .map((item) => (
                      <li key={item.key} className="flex items-start gap-2.5">
                        <span className="flex size-7 flex-none items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
                          <item.Icon className="size-4" />
                        </span>
                        <span className="pt-1 leading-snug">{item.text}</span>
                      </li>
                    ))}
                </ul>
              </div>
              <div className="flex flex-col gap-3 lg:items-stretch">
                <Link
                  href={startHref}
                  className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-[1.0625rem] font-semibold text-[#4c1fc4] shadow-[0_14px_30px_-14px_rgba(10,15,46,.6)] transition hover:-translate-y-px motion-reduce:transition-none"
                >
                  {t("final.cta")}
                  <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/rappel"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/40 px-6 text-[1.0625rem] font-medium text-white transition hover:bg-white/10"
                >
                  {t("plans.callback")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
