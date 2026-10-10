import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import {
  ArrowIcon,
  BrowserIcon,
  CheckIcon,
  DocumentIcon,
  EuroIcon,
  GlobeIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  ServerIcon,
  ShieldIcon,
  SparkleIcon,
  CalendarCheckIcon,
  HeartIcon,
} from "@/components/marketing/icons";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { CarouselDots } from "@/components/marketing/CarouselDots";
import { DashboardShowcase, type DashboardItem } from "@/components/marketing/DashboardShowcase";
import { OptionsConfigurator } from "@/components/marketing/OptionsConfigurator";
import { PlanCards } from "@/components/marketing/PlanCards";
import { formatMoney } from "@/lib/format";
import { listPlanOptions, pricedOption } from "@/modules/billing/options";
import { smsPackOffer } from "@/modules/billing/sms-packs";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { pickLocalized } from "@/i18n/locales";
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
  "fees",
  "domain",
  "hosting",
  "editing",
  "booking",
  "change",
  "cancel",
  "ownership",
  "delay",
  "payments",
] as const;

const TITLE = "font-display font-bold tracking-[-0.03em] text-night";
const BADGE = "inline-block rounded-full bg-blush px-3.5 py-1.5 text-[0.9rem] font-medium text-rust";
/** Bouton principal : pilule corail foncé, flèche qui avance au survol. */
const PRIMARY =
  "group inline-flex items-center gap-2.5 rounded-full bg-brick font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(212,64,47,.32)]";
/** Étiquette dorée des sections tarifs, options, tableau de bord et conditions. */
const GOLD_BADGE = "inline-block rounded-full bg-cream px-3.5 py-1.5 text-[0.9rem] font-medium text-copper";
const LINK =
  "inline-flex min-h-11 items-center font-medium text-night underline underline-offset-4 transition-colors hover:text-brick";

/**
 * Site commercial, d'après la maquette validée (docs : règles de design) :
 * accroche avec téléphone dessiné, métiers, trois étapes, fonctions,
 * témoignages, packs (lus dans la base), questions, bandeau final. Pensé
 * d'abord pour le téléphone.
 */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const config = env();
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    options: await listPlanOptions(tx),
    display: String(await getPlatformSetting(tx, "prices_display")),
    commission: Number(await getPlatformSetting(tx, "deposit_commission_percent")),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    goLiveDays: Number(await getPlatformSetting(tx, "go_live_delay_days")),
    retentionDays: Number(await getPlatformSetting(tx, "retention_days_after_cancel")),
    buyout: (await getPlatformSetting(tx, "site_buyout_enabled"))
      ? Number(await getPlatformSetting(tx, "site_buyout_price_cents"))
      : null,
    soon: await getPlatformSetting(tx, "features_soon"),
    salesOpen: await salesOpen(tx),
    smsPack: await smsPackOffer(tx),
    showcase: await listShowcase(tx),
  }));
  const percent = data.commission;
  const soon = new Set<string>(data.soon);
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  const nameOf = (value: Parameters<typeof pickLocalized>[0]) => pickLocalized(value, locale);
  const paid = data.plans.filter((plan) => plan.priceCents > 0);
  // « Dès 19,90 € » : le pack le moins cher proposé (lu dans les réglages).
  const startPrice = paid.length > 0 ? money(Math.min(...paid.map((plan) => plan.priceCents))) : null;
  const featured =
    data.plans[data.plans.length >= 3 ? Math.floor(data.plans.length / 2) : data.plans.length - 1];
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;

  // Questions : réponses calculées avec les réglages (engagement, délais, commission).
  const faqValues = {
    months: data.commitment,
    days: data.goLiveDays,
    percent,
    product: config.PRODUCT_NAME,
  };
  const faq = FAQ.map((key) => ({
    key,
    q: t(`faq.items.${key}.q`),
    a: t(`faq.items.${key}.a`, key === "cancel" ? { ...faqValues, days: data.retentionDays } : faqValues),
  }));

  // Tableau de bord : chaque possibilité dit si elle est incluse, liée à une option, ou à venir.
  const optionName = (code: string) => {
    const option = data.options.find((item) => item.code === code);
    return option ? nameOf(option.name) : null;
  };
  const tagFor = (rule: { feature?: string; option?: string }): { tag: string; included: boolean } | null => {
    if (rule.feature && soon.has(rule.feature)) return { tag: t("dashboard.tags.soon"), included: false };
    if (rule.option) {
      const name = optionName(rule.option);
      return name ? { tag: t("dashboard.tags.option", { name }), included: false } : null;
    }
    if (!rule.feature || data.plans.every((plan) => plan.features[rule.feature!]))
      return { tag: t("dashboard.tags.included"), included: true };
    const first = data.plans.find((plan) => plan.features[rule.feature!]);
    return first ? { tag: t("dashboard.tags.from", { plan: nameOf(first.name) }), included: false } : null;
  };
  const dashboard = (
    [
      { key: "content", rule: { feature: "selfEditing" } },
      { key: "pages", rule: { feature: "selfEditing" } },
      { key: "requests", rule: { feature: "contactForm" } },
      { key: "bookings", rule: { option: "booking" } },
      { key: "payments", rule: { option: "online-payment" } },
      { key: "stats", rule: { option: "booking" } },
      { key: "options", rule: {} },
    ] as const
  ).flatMap((item): DashboardItem[] => {
    const tag = tagFor(item.rule);
    return tag ? [{ key: item.key, ...tag }] : [];
  });

  const conditions = [
    { key: "creation", Icon: EuroIcon },
    { key: "commitment", Icon: CalendarCheckIcon },
    { key: "hosting", Icon: ServerIcon },
    { key: "editing", Icon: PencilIcon },
    { key: "provided", Icon: LockIcon },
    { key: "domain", Icon: GlobeIcon },
    { key: "content", Icon: HeartIcon },
    { key: "export", Icon: DocumentIcon },
  ] as const;

  // Données lues par Google : l'entreprise, les offres et les questions (mêmes textes que la page).
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
  const steps = [
    { key: "create", Icon: BrowserIcon, accent: false },
    { key: "book", Icon: PencilIcon, accent: true },
    { key: "cash", Icon: SparkleIcon, accent: false },
  ] as const;

  return (
    <div className="text-base leading-[1.6] text-body lg:text-[1.05rem]">
      <script
        type="application/ld+json"
        // Le « < » est échappé : le texte ne peut pas fermer la balise.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <PlatformHeader />
      <main id="contenu">
        {/* Accroche */}
        <section className="mx-auto flex max-w-[75rem] flex-wrap items-center gap-8 overflow-hidden px-4 pb-10 pt-6 sm:px-6 lg:gap-12 lg:pb-14 lg:pt-8">
          <div className="hn-up flex-[1_1_27rem]">
            <p className={`${BADGE} mb-5`}>{t("badge")}</p>
            <h1 className={`${TITLE} mb-[1.1rem] text-[clamp(1.85rem,4.1vw,3.4rem)] leading-[1.06]`}>
              {t("title")}
              <br />
              <span className="text-brick underline decoration-blush-strong decoration-[0.14em] underline-offset-[0.14em]">
                {t("titleAccent")}
              </span>
            </h1>
            <p className="mb-7 max-w-[30rem] text-[1.05rem] lg:text-[1.125rem]">
              {t("subtitle", { price: startPrice ?? "" })}
            </p>
            <div className="mb-8 flex flex-wrap items-center gap-6">
              <a href="#tarifs" className={`${PRIMARY} min-h-11 px-6 py-3 text-base`}>
                {t("cta")}
                <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#etapes" className={LINK}>
                {t("howItWorks")}
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-[0.98rem]">
              {[t("promises.creation"), t("promises.domain"), t("promises.hosting")].map((text) => (
                <li key={text} className="flex items-center gap-2">
                  <CheckIcon className="size-[18px] text-brick" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <HeroVisual />
        </section>

        {/* Métiers */}
        <section aria-labelledby="titre-metiers" className="mx-auto max-w-[75rem] px-4 pb-12 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-3 xl:flex-nowrap">
            <h2
              id="titre-metiers"
              className="mr-1 shrink-0 font-sans text-[1.05rem] font-semibold text-night"
            >
              {t("madeFor.title")}
            </h2>
            {/* Sur téléphone, les métiers défilent sur une seule ligne. */}
            <ul className="-mx-4 flex w-[calc(100%+2rem)] gap-2.5 overflow-x-auto px-4 py-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 xl:flex-nowrap">
              {(t.raw("madeFor.items") as string[]).map((item) => (
                <li
                  key={item}
                  className="shrink-0 whitespace-nowrap rounded-full border-[1.5px] border-line bg-white px-4 py-2 transition hover:-translate-y-[3px] hover:border-coral"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Trois étapes */}
        <section
          id="etapes"
          aria-labelledby="titre-etapes"
          className="relative mx-3 scroll-mt-4 overflow-hidden rounded-[2rem] bg-navy px-4 py-14 sm:px-6 lg:rounded-[3rem] lg:py-20"
        >
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 size-[22rem] rounded-full border-[3rem] border-[#223460]"
          />
          <div aria-hidden="true" className="absolute -bottom-16 -left-16 size-48 rounded-full bg-coral" />
          <div className="relative mx-auto max-w-[75rem]">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10 lg:gap-6">
              <h2
                id="titre-etapes"
                className="font-display text-[clamp(1.9rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white"
              >
                {t("steps.title")}
                <br />
                <span className="text-salmon">{t("steps.titleAccent")}</span>
              </h2>
              <p className="max-w-sm text-[1.05rem] text-[#d7dce6]">{t("steps.intro")}</p>
            </div>
            {/* Téléphone : les trois cartes défilent d'un geste ; plus large : côte à côte. */}
            <ol
              id="etapes-liste"
              className="reveal -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:p-0 lg:gap-6 [&::-webkit-scrollbar]:hidden"
            >
              {steps.map(({ key, Icon, accent }, index) => (
                <li
                  key={key}
                  className={`flex w-[82%] shrink-0 snap-center flex-col gap-3 rounded-[1.75rem] p-6 transition duration-200 hover:-translate-y-2.5 sm:w-[58%] md:w-auto lg:gap-4 lg:p-7 hover:shadow-[0_28px_54px_rgba(0,0,0,.38)] ${accent ? "bg-brick" : "bg-white"}`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`flex size-[3.4rem] items-center justify-center rounded-[1.1rem] ${accent ? "bg-white text-brick" : "bg-navy text-white"}`}
                    >
                      <Icon className="size-[26px]" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`font-display text-[3.2rem] font-bold leading-[0.9] lg:text-[3.8rem] ${accent ? "text-white" : "text-coral"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3
                    className={`mt-1 font-sans text-xl font-semibold lg:text-[1.35rem] ${accent ? "text-white" : "text-night"}`}
                  >
                    {t(`steps.${key}.title`)}
                  </h3>
                  <p className={`flex-1 ${accent ? "text-white" : "text-body"}`}>{t(`steps.${key}.text`)}</p>
                  <p
                    className={`self-start rounded-full px-3.5 py-1.5 text-[0.88rem] font-semibold text-rust ${accent ? "bg-white" : "bg-blush"}`}
                  >
                    {t(`steps.${key}.tag`)}
                  </p>
                </li>
              ))}
            </ol>
            <CarouselDots
              targetId="etapes-liste"
              count={steps.length}
              label={t.raw("steps.dot") as string}
              className="mt-2 md:hidden"
            />
          </div>
        </section>

        {/* Ils nous font confiance : vrais témoignages saisis dans l'admin (bloc caché s'il n'y en a pas). */}
        {data.showcase.length > 0 && (
          <section
            id="confiance"
            aria-labelledby="titre-confiance"
            className="mx-auto max-w-[75rem] scroll-mt-4 px-4 pt-14 sm:px-6 lg:pt-20"
          >
            <p className={`${BADGE} mb-4`}>{t("showcase.badge")}</p>
            <h2
              id="titre-confiance"
              className={`${TITLE} mb-8 text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05] lg:mb-10`}
            >
              {t("showcase.title")} <span className="text-brick">{t("showcase.titleAccent")}</span>
            </h2>
            <ul className="reveal grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {data.showcase.map((entry) => (
                <li key={entry.id}>
                  <figure className="flex h-full flex-col rounded-[1.5rem] border-2 border-line bg-white p-6 lg:rounded-[1.75rem] lg:p-7">
                    <span aria-hidden="true" className="font-display text-[3rem] leading-[0.6] text-coral">
                      “
                    </span>
                    <blockquote className="mt-3 flex-1 text-[1.05rem] text-night">{entry.quote}</blockquote>
                    <figcaption className="mt-5 border-t border-line pt-4">
                      <p className="font-semibold text-night">{entry.author}</p>
                      <p className="text-[0.95rem] text-stone">
                        {entry.name} · {entry.activity}
                      </p>
                      {entry.url && (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noopener"
                          className={`${LINK} mt-1 text-[0.95rem]`}
                        >
                          {t("showcase.visit", { name: entry.name })} ↗
                        </a>
                      )}
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Packs : trois cartes recto/verso */}
        <section
          id="tarifs"
          aria-labelledby="titre-tarifs"
          className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-14 sm:px-6 lg:pt-20"
        >
          <div className="mb-8 text-center lg:mb-12">
            <p className={`${GOLD_BADGE} mb-4`}>{t("plans.badge", { price: startPrice ?? "" })}</p>
            <h2
              id="titre-tarifs"
              className={`${TITLE} mb-3 text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}
            >
              {t("plans.title")} <span className="text-copper">{t("plans.titleAccent")}</span>
            </h2>
            <p className="mx-auto max-w-[36rem] text-[1.05rem]">{t("plans.subtitle")}</p>
          </div>
          <PlanCards
            plans={data.plans}
            options={data.options.map((option) => ({
              code: option.code,
              name: option.name,
              isAvailable: option.isAvailable,
            }))}
            locale={locale}
            smsPack={data.smsPack}
            soon={data.soon}
            salesOpen={data.salesOpen}
            conditions={{ commitmentMonths: data.commitment, display: data.display }}
          />
          <p className="mt-8 text-center">
            <Link href="/comparatif" className={`${LINK} gap-1.5 font-semibold`}>
              {t("plans.compare")}
              <ArrowIcon className="size-4" />
            </Link>
          </p>
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[0.85rem] text-stone">
            {[
              t("plans.note.display", { display: data.display }),
              t("plans.note.commitment", { months: data.commitment }),
              t("plans.note.setupFree"),
              t("plans.note.hosting"),
            ].map((text, index) => (
              <li key={text} className="flex items-center gap-3">
                {index > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-gold" />}
                {text}
              </li>
            ))}
          </ul>
        </section>

        {/* Options à la carte, avec le total de l'abonnement */}
        {data.options.length > 0 && (
          <section
            id="options"
            aria-labelledby="titre-options"
            className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-16 sm:px-6 lg:pt-24"
          >
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10 lg:gap-6">
              <div>
                <p className={`${GOLD_BADGE} mb-4`}>{t("options.badge")}</p>
                <h2
                  id="titre-options"
                  className={`${TITLE} text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}
                >
                  {t("options.title")} <span className="text-copper">{t("options.titleAccent")}</span>
                </h2>
              </div>
              <p className="max-w-md text-[1.05rem]">{t("options.intro")}</p>
            </div>
            <OptionsConfigurator
              plans={data.plans.map((plan) => ({
                code: plan.code,
                name: nameOf(plan.name),
                priceCents: plan.priceCents,
              }))}
              options={data.options.map((option) => ({
                ...pricedOption(option),
                name: nameOf(option.name),
                description: nameOf(option.description),
                icon: option.icon,
                available: option.isAvailable,
              }))}
              defaultPlan={featured?.code ?? ""}
              display={data.display}
              salesOpen={data.salesOpen}
            />
          </section>
        )}

        {/* Tableau de bord */}
        <section
          id="tableau-de-bord"
          aria-labelledby="titre-tableau"
          className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-16 sm:px-6 lg:pt-24"
        >
          <div className="mb-10 max-w-2xl lg:mb-12">
            <p className={`${GOLD_BADGE} mb-4`}>{t("dashboard.badge")}</p>
            <h2
              id="titre-tableau"
              className={`${TITLE} mb-3 text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}
            >
              {t("dashboard.title")} <span className="text-copper">{t("dashboard.titleAccent")}</span>
            </h2>
            <p className="text-[1.05rem]">{t("dashboard.intro")}</p>
          </div>
          <DashboardShowcase items={dashboard} />
        </section>

        {/* Conditions commerciales */}
        <section
          id="conditions"
          aria-labelledby="titre-conditions"
          className="mx-3 mt-16 scroll-mt-20 rounded-[2rem] bg-white px-4 py-14 sm:px-6 lg:mt-24 lg:rounded-[3rem] lg:py-20"
        >
          <div className="mx-auto max-w-[75rem]">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10 lg:gap-6">
              <div>
                <p className={`${GOLD_BADGE} mb-4`}>{t("conditions.badge")}</p>
                <h2
                  id="titre-conditions"
                  className={`${TITLE} text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}
                >
                  {t("conditions.title")} <span className="text-copper">{t("conditions.titleAccent")}</span>
                </h2>
              </div>
              <p className="max-w-md text-[1.05rem]">{t("conditions.intro")}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              {conditions.map(({ key, Icon }) => (
                <li
                  key={key}
                  className="group flex flex-col gap-2.5 rounded-[1.5rem] border-2 border-line bg-ivory p-5 transition duration-300 hover:-translate-y-1 hover:border-gold motion-reduce:transition-none"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-navy text-gold">
                    <Icon className="size-5" />
                  </span>
                  <p className="font-semibold leading-snug text-night">
                    {t(`conditions.items.${key}.title`, { months: data.commitment })}
                  </p>
                  <p className="text-[0.9rem] leading-snug text-stone">
                    {t(`conditions.items.${key}.text`, {
                      months: data.commitment,
                      product: config.PRODUCT_NAME,
                    })}
                  </p>
                </li>
              ))}
            </ul>
            {data.buyout !== null && (
              <p className="mt-5 text-center text-[0.9rem] text-stone">
                {t("conditions.buyout", { amount: money(data.buyout) })}
              </p>
            )}
            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[0.9rem] text-night">
              {[
                { Icon: ShieldIcon, text: t("plans.trust.secure") },
                { Icon: CheckIcon, text: t("plans.trust.commission", { percent }) },
              ].map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="size-[18px] text-copper" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Questions */}
        <section
          id="questions"
          aria-labelledby="titre-questions"
          className="scroll-mt-4 px-4 py-14 sm:px-6 lg:py-20"
        >
          <div className="mx-auto flex max-w-[75rem] flex-wrap gap-8 lg:gap-12">
            <div className="flex-[1_1_18rem]">
              <h2
                id="titre-questions"
                className={`${TITLE} mb-3 text-[clamp(1.8rem,3.2vw,2.5rem)] leading-[1.05]`}
              >
                {t("faq.title")}
              </h2>
              <p className="mb-5 text-[1.05rem]">{t("faq.intro")}</p>
              <a href={`mailto:${contact}`} className={`${LINK} font-semibold`}>
                {t("faq.contact")}
              </a>
            </div>
            <div className="reveal flex flex-[2_1_26rem] flex-col gap-3">
              {faq.map((item, index) => (
                <details
                  key={item.key}
                  open={index === 0}
                  className="group rounded-[1.25rem] border-[1.5px] border-line bg-ivory transition-colors open:border-coral open:bg-white"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold lg:px-6 lg:text-[1.1rem] text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex size-[2.2rem] flex-none items-center justify-center rounded-full bg-blush text-rust transition group-open:rotate-45 group-open:bg-brick group-open:text-white">
                      <PlusIcon className="size-4" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[0.95rem] lg:px-6 lg:text-base">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Bandeau final */}
        <section className="px-3 pb-12 pt-4">
          <div className="reveal relative mx-auto max-w-[74rem] overflow-hidden rounded-[2rem] bg-brick px-6 py-12 text-center lg:rounded-[3rem] lg:px-8 lg:py-16">
            <div
              aria-hidden="true"
              className="absolute -left-20 -top-20 size-64 rounded-full border-[2.5rem] border-[#dd5646]"
            />
            <div aria-hidden="true" className="absolute -bottom-12 -right-12 size-44 rounded-full bg-navy" />
            <div className="relative">
              <h2 className="hn-balance mb-4 font-display text-[clamp(1.8rem,3.6vw,2.75rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white">
                {t("final.title")} <br className="hidden sm:block" />
                {t("final.titleEnd")}
              </h2>
              <p className="mx-auto mb-7 max-w-[34rem] text-[1.05rem] text-white lg:mb-8">
                {t("final.text")}
              </p>
              <a
                href="#tarifs"
                className="group inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-rust transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(70,15,8,.35)]"
              >
                {t("final.cta")}
                <ArrowIcon className="size-5 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
