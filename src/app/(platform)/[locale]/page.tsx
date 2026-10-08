import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import {
  ArrowIcon,
  BellIcon,
  BrowserIcon,
  CalendarCheckIcon,
  CardIcon,
  CheckIcon,
  EuroIcon,
  GiftIcon,
  HeartIcon,
  LockIcon,
  PlusIcon,
  ReviewIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/marketing/icons";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { CarouselDots } from "@/components/marketing/CarouselDots";
import { PlanCards } from "@/components/marketing/PlanCards";
import { formatMoney } from "@/lib/format";
import { smsPackOffer } from "@/modules/billing/sms-packs";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { pickLocalized } from "@/i18n/locales";
import { listPublicPlans } from "@/modules/billing/plans";
import { planAllowsBooking } from "@/modules/billing/features";
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

/** Question de la FAQ ; « if » : affichée seulement si le réglage concerné s’applique. */
type Faq = { q: string; a: string; if?: "commitment" | "smsPack" };

const TITLE = "font-display font-bold tracking-[-0.03em] text-night";
const BADGE = "inline-block rounded-full bg-blush px-3.5 py-1.5 text-[0.9rem] font-medium text-rust";
/** Bouton principal : pilule corail foncé, flèche qui avance au survol. */
const PRIMARY =
  "group inline-flex items-center gap-2.5 rounded-full bg-brick font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(212,64,47,.32)]";
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
    display: await getPlatformSetting(tx, "prices_display"),
    commission: Number(await getPlatformSetting(tx, "deposit_commission_percent")),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    soon: await getPlatformSetting(tx, "features_soon"),
    salesOpen: await salesOpen(tx),
    smsPack: await smsPackOffer(tx),
    showcase: await listShowcase(tx),
  }));
  const percent = data.commission;
  // Frais de création sans engagement : propres à chaque pack, annoncés « à partir de » le plus bas.
  const fees = data.plans
    .filter((plan) => plan.priceCents > 0)
    .map((plan) => plan.noCommitmentFeeCents ?? 0)
    .filter((fee) => fee > 0);
  const minFee = fees.length > 0 ? Math.min(...fees) : 0;
  // « 149 € » plutôt que « 149,00 € » ; les centimes ne s'affichent que s'il y en a.
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  // Une question qui dépend d'un réglage (ex. « Suis-je engagé ? ») n'apparaît que s'il s'applique.
  const faq = (t.raw("faq.items") as Faq[]).filter(
    (item) =>
      (item.if !== "commitment" || data.commitment > 0) &&
      (item.if !== "smsPack" ||
        (data.smsPack.priceCents > 0 && data.plans.some((plan) => (plan.limits.smsPerMonth ?? 0) > 0))),
  );
  // « {plan:fonction} » dans la FAQ : nom du premier pack qui la comprend (suit la configuration).
  const planWith = (feature: string) =>
    pickLocalized(data.plans.find((plan) => plan.features[feature])?.name ?? data.plans.at(-1)!.name, locale);
  const answer = (text: string) =>
    text
      .replace("{commission}", t("faq.commission", { percent }))
      .replace("{smsPackSize}", String(data.smsPack.size))
      .replace("{smsPackPrice}", money(data.smsPack.priceCents))
      .replace("{commitmentMonths}", String(data.commitment))
      .replace("{noCommitmentFee}", money(minFee))
      .replace("{product}", config.PRODUCT_NAME)
      .replace(/\{plan:(\w+)\}/g, (_, feature: string) => planWith(feature));
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  // Fonctions présentées : l'étiquette dit à partir de quel pack (lu dans la configuration).
  const features = [
    { key: "reminders", Icon: BellIcon, feature: null },
    { key: "deposit", Icon: CardIcon, feature: "onlinePayment" },
    { key: "customerSpace", Icon: UserIcon, feature: "customerSpace" },
    { key: "giftCards", Icon: GiftIcon, feature: "giftCards", siteToo: true },
    { key: "loyalty", Icon: HeartIcon, feature: "loyalty" },
    { key: "reviews", Icon: ReviewIcon, feature: "googleReviews", siteToo: true },
  ] as const;
  const featureTag = (feature: string | null, siteToo = false) => {
    // Premier pack avec réservation qui comprend la fonction, et premier pack sans réservation s'il l'a aussi.
    const withBooking = data.plans.filter((item) => planAllowsBooking(item.features));
    const plan = feature ? withBooking.find((item) => item.features[feature]) : withBooking[0];
    if (!plan) return null;
    if (plan.priceCents <= 0) return t("features.tagAll");
    // Fonctions qui n'ont pas besoin de la réservation : on cite aussi le premier pack sans réservation.
    const sitePlan =
      feature && siteToo
        ? data.plans.find((item) => !planAllowsBooking(item.features) && item.features[feature])
        : undefined;
    return sitePlan
      ? t("features.tagFromBoth", {
          plan: pickLocalized(plan.name, locale),
          sitePlan: pickLocalized(sitePlan.name, locale),
        })
      : t("features.tagFrom", { plan: pickLocalized(plan.name, locale) });
  };
  // Données lues par Google : l'entreprise et les questions (mêmes textes que la page).
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
        acceptedAnswer: { "@type": "Answer", text: answer(item.a) },
      })),
    },
  ];
  const steps = [
    { key: "create", Icon: BrowserIcon, accent: false },
    { key: "book", Icon: CalendarCheckIcon, accent: true },
    { key: "cash", Icon: EuroIcon, accent: false },
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
            <p className="mb-7 max-w-[30rem] text-[1.05rem] lg:text-[1.125rem]">{t("subtitle")}</p>
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
              {[t("promises.commission", { percent }), t("promises.domain"), t("promises.install")].map(
                (text) => (
                  <li key={text} className="flex items-center gap-2">
                    <CheckIcon className="size-[18px] text-brick" />
                    {text}
                  </li>
                ),
              )}
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
                    {t(`steps.${key}.tag`, { percent })}
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

        {/* Fonctions incluses */}
        <section
          id="fonctions"
          aria-labelledby="titre-fonctions"
          className="mx-auto max-w-[75rem] scroll-mt-4 px-4 pt-14 sm:px-6 lg:pt-20"
        >
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10 lg:gap-6">
            <div>
              <p className={`${BADGE} mb-4`}>{t("features.badge")}</p>
              <h2
                id="titre-fonctions"
                className={`${TITLE} text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}
              >
                {t("features.title")} <span className="text-brick">{t("features.titleAccent")}</span>
              </h2>
            </div>
            <p className="max-w-sm text-[1.05rem]">{t("features.intro")}</p>
          </div>
          <ul className="reveal grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {features.map((item) => {
              const { key, Icon, feature } = item;
              const tag = featureTag(feature, "siteToo" in item && item.siteToo);
              if (!tag) return null;
              return (
                <li
                  key={key}
                  className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[1.5rem] border-2 border-line bg-white p-5 transition duration-200 sm:flex sm:flex-col sm:gap-3 sm:p-6 lg:rounded-[1.75rem] lg:p-7 hover:-translate-y-2 hover:border-coral hover:shadow-[0_22px_44px_rgba(22,24,29,.08)]"
                >
                  {/* Téléphone : icône à gauche, texte à droite (ligne compacte). */}
                  <span className="row-span-3 flex size-11 items-center justify-center rounded-[0.9rem] bg-blush text-brick sm:size-[3.2rem] sm:rounded-[1rem]">
                    <Icon className="size-[22px] sm:size-[26px]" />
                  </span>
                  <h3 className="font-sans text-[1.1rem] font-semibold text-night sm:mt-1 lg:text-[1.25rem]">
                    {t(`features.items.${key}.title`)}
                  </h3>
                  <p className="flex-1 text-[0.95rem] lg:text-base">{t(`features.items.${key}.text`)}</p>
                  <p className="self-start rounded-full bg-sand px-3 py-1 text-[0.85rem] font-semibold text-stone">
                    {tag}
                  </p>
                </li>
              );
            })}
          </ul>
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

        {/* Packs */}
        <section
          id="tarifs"
          aria-labelledby="titre-tarifs"
          className="mx-auto max-w-[75rem] scroll-mt-20 px-4 pt-14 sm:px-6 lg:pt-20"
        >
          <div className="mb-6 text-center lg:mb-8">
            <h2
              id="titre-tarifs"
              className={`${TITLE} mb-3 text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}
            >
              {t("plans.title")} <span className="text-brick">{t("plans.titleAccent", { percent })}</span>
            </h2>
            <p className="mx-auto max-w-[34rem] text-[1.05rem]">{t("plans.subtitle")}</p>
          </div>
          <PlanCards
            plans={data.plans}
            locale={locale}
            smsPack={data.smsPack}
            soon={data.soon}
            salesOpen={data.salesOpen}
          />
          <p className="mt-6 text-center">
            <Link href="/comparatif" className={`${LINK} gap-1.5 font-semibold`}>
              {t("plans.compare")}
              <ArrowIcon className="size-4" />
            </Link>
          </p>
          {/* Garanties : trois engagements clairs, puis les conditions en une ligne. */}
          <ul className="mx-auto mt-10 grid max-w-[62rem] gap-3 sm:grid-cols-3 lg:mt-12 lg:gap-4">
            {[
              {
                Icon: EuroIcon,
                title: t("plans.trust.commission", { percent }),
                text: t("plans.trust.commissionText"),
              },
              { Icon: LockIcon, title: t("plans.trust.secure"), text: t("plans.trust.secureText") },
              { Icon: ShieldIcon, title: t("plans.trust.data"), text: t("plans.trust.dataText") },
            ].map(({ Icon, title, text }) => (
              <li
                key={title}
                className="group flex items-start gap-3.5 rounded-[1.25rem] border-2 border-line bg-white p-4 transition duration-300 hover:-translate-y-1 hover:border-coral hover:shadow-[0_18px_36px_-18px_rgba(22,24,29,.25)] motion-reduce:transition-none lg:p-5"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-blush text-brick transition duration-300 group-hover:-rotate-6 motion-reduce:transition-none">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="font-semibold leading-snug text-night">{title}</p>
                  <p className="mt-0.5 text-[0.88rem] leading-snug text-stone">{text}</p>
                </div>
              </li>
            ))}
          </ul>
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[0.85rem] text-stone">
            {[
              t("plans.note.display", { display: String(data.display) }),
              // Deux formules : avec engagement (création offerte) ou sans (frais de création).
              data.commitment > 0
                ? t("plans.note.formulas", {
                    months: data.commitment,
                    fee: minFee > 0 ? money(minFee) : "none",
                  })
                : t("plans.note.commitment", { months: 0 }),
              ...(data.commitment === 0
                ? [
                    minFee > 0
                      ? t("plans.note.setupFee", { amount: money(minFee) })
                      : t("plans.note.setupFree"),
                  ]
                : []),
            ].map((text, index) => (
              <li key={text} className="flex items-center gap-3">
                {index > 0 && <span aria-hidden="true" className="size-1 rounded-full bg-blush-strong" />}
                {text}
              </li>
            ))}
          </ul>
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
                  key={item.q}
                  open={index === 0}
                  className="group rounded-[1.25rem] border-[1.5px] border-line bg-ivory transition-colors open:border-coral open:bg-white"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold lg:px-6 lg:text-[1.1rem] text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex size-[2.2rem] flex-none items-center justify-center rounded-full bg-blush text-rust transition group-open:rotate-45 group-open:bg-brick group-open:text-white">
                      <PlusIcon className="size-4" />
                    </span>
                  </summary>
                  <p className="px-5 pb-5 text-[0.95rem] lg:px-6 lg:text-base">{answer(item.a)}</p>
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
