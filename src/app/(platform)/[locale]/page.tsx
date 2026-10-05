import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import {
  ArrowIcon,
  BrowserIcon,
  CalendarCheckIcon,
  CheckIcon,
  EuroIcon,
  PlusIcon,
} from "@/components/marketing/icons";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { PlanCards } from "@/components/marketing/PlanCards";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { resolveLocale } from "@/i18n/translator";
import { pickLocalized } from "@/i18n/locales";
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
      languages: Object.fromEntries(ENABLED_LOCALES.map((item) => [item, `${base}/${item}`])),
    },
    openGraph: {
      title: t("title", { product: env().PRODUCT_NAME }),
      description: t("description"),
      type: "website",
    },
  };
}

type Faq = { q: string; a: string };

const TITLE = "font-display font-bold tracking-[-0.03em] text-night";
const BADGE = "inline-block rounded-full bg-blush px-3.5 py-1.5 text-[0.9rem] font-medium text-rust";
/** Bouton principal : pilule corail foncé, flèche qui avance au survol. */
const PRIMARY =
  "group inline-flex items-center gap-2.5 rounded-full bg-brick font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(212,64,47,.32)]";
const LINK = "font-medium text-night underline underline-offset-4 transition-colors hover:text-brick";

/**
 * Site commercial, d'après la maquette validée (docs : règles de design) :
 * accroche avec téléphone dessiné, métiers, trois étapes, packs (lus dans la
 * base), questions, bandeau final. Pensé d'abord pour le téléphone.
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
    setupFee: Number(await getPlatformSetting(tx, "setup_fee_cents")),
  }));
  const percent = data.commission;
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const faq = t.raw("faq.items") as Faq[];
  // « {plan:fonction} » dans la FAQ : nom du premier pack qui la comprend (suit la configuration).
  const planWith = (feature: string) =>
    pickLocalized(data.plans.find((plan) => plan.features[feature])?.name ?? data.plans.at(-1)!.name, locale);
  const answer = (text: string) =>
    text
      .replace("{commission}", t("faq.commission", { percent }))
      .replace(/\{plan:(\w+)\}/g, (_, feature: string) => planWith(feature));
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const steps = [
    { key: "create", Icon: BrowserIcon, accent: false },
    { key: "book", Icon: CalendarCheckIcon, accent: true },
    { key: "cash", Icon: EuroIcon, accent: false },
  ] as const;

  return (
    <div className="text-[1.05rem] leading-[1.55] text-body">
      <PlatformHeader />
      <main id="contenu">
        {/* Accroche */}
        <section className="mx-auto flex max-w-[75rem] flex-wrap items-center gap-12 overflow-hidden px-4 pb-16 pt-8 sm:px-6">
          <div className="hn-up flex-[1_1_27rem]">
            <p className={`${BADGE} mb-5`}>{t("badge")}</p>
            <h1 className={`${TITLE} mb-[1.1rem] text-[clamp(1.85rem,4.1vw,3.4rem)] leading-[1.06]`}>
              {t("title")}
              <br />
              <span className="text-brick underline decoration-blush-strong decoration-[0.14em] underline-offset-[0.14em]">
                {t("titleAccent")}
              </span>
            </h1>
            <p className="mb-7 max-w-[30rem] text-[1.125rem]">{t("subtitle")}</p>
            <div className="mb-8 flex flex-wrap items-center gap-6">
              <a href="#tarifs" className={`${PRIMARY} min-h-11 px-6 py-3 text-base`}>
                {t("cta")}
                <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-1" />
              </a>
              <a href="#tarifs" className={LINK}>
                {t("seePlans")}
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
        <section aria-labelledby="titre-metiers" className="mx-auto max-w-[75rem] px-4 pb-14 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="titre-metiers" className="mr-2 font-sans text-[1.05rem] font-semibold text-night">
              {t("madeFor.title")}
            </h2>
            <ul className="contents">
              {(t.raw("madeFor.items") as string[]).map((item) => (
                <li
                  key={item}
                  className="rounded-full border-[1.5px] border-line bg-white px-[1.1rem] py-2 transition hover:-translate-y-[3px] hover:border-coral"
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
          className="relative mx-3 scroll-mt-4 overflow-hidden rounded-[3rem] bg-navy px-4 py-[5.5rem] sm:px-6"
        >
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 size-[22rem] rounded-full border-[3rem] border-[#223460]"
          />
          <div aria-hidden="true" className="absolute -bottom-16 -left-16 size-48 rounded-full bg-coral" />
          <div className="relative mx-auto max-w-[75rem]">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
              <h2
                id="titre-etapes"
                className="font-display text-[2.5rem] font-bold leading-none tracking-[-0.03em] text-white sm:text-[3.4rem]"
              >
                {t("steps.title")}
                <br />
                <span className="text-salmon">{t("steps.titleAccent")}</span>
              </h2>
              <p className="max-w-sm text-[1.2rem] text-[#d7dce6]">{t("steps.intro")}</p>
            </div>
            <ol className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(16.5rem,1fr))]">
              {steps.map(({ key, Icon, accent }, index) => (
                <li
                  key={key}
                  className={`flex flex-col gap-4 rounded-[1.75rem] p-8 transition duration-200 hover:-translate-y-2.5 hover:shadow-[0_28px_54px_rgba(0,0,0,.38)] ${accent ? "bg-brick" : "bg-white"}`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`flex size-[3.4rem] items-center justify-center rounded-[1.1rem] ${accent ? "bg-white text-brick" : "bg-navy text-white"}`}
                    >
                      <Icon className="size-[26px]" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`font-display text-[4.4rem] font-bold leading-[0.9] ${accent ? "text-white" : "text-coral"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3
                    className={`mt-2 font-sans text-2xl font-semibold ${accent ? "text-white" : "text-night"}`}
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
          </div>
        </section>

        {/* Packs */}
        <section
          id="tarifs"
          aria-labelledby="titre-tarifs"
          className="mx-auto max-w-[75rem] scroll-mt-4 px-4 py-[5.5rem] sm:px-6"
        >
          <div className="mb-14 text-center">
            <p className={`${BADGE} mb-5`}>{t("plans.badge")}</p>
            <h2 id="titre-tarifs" className={`${TITLE} mb-3 text-[2.5rem] leading-none sm:text-[3.2rem]`}>
              {t("plans.title")} <span className="text-brick">{t("plans.titleAccent", { percent })}</span>
            </h2>
            <p className="mx-auto max-w-[34rem] text-[1.15rem]">{t("plans.subtitle")}</p>
            <p className="mx-auto mt-2 max-w-[34rem] text-[0.95rem] text-stone">
              {t("plans.pricesDisplay", { display: String(data.display) })}{" "}
              {t("plans.commitment", { months: data.commitment })}{" "}
              {data.setupFee > 0
                ? t("plans.setupFee", { amount: money(data.setupFee) })
                : t("plans.setupFree")}
            </p>
          </div>
          <PlanCards plans={data.plans} locale={locale} />
          <ul className="mt-12 flex flex-wrap justify-center gap-x-10 gap-y-3 font-medium text-night">
            {[t("plans.trust.commission", { percent }), t("plans.trust.secure"), t("plans.trust.data")].map(
              (text) => (
                <li key={text} className="flex items-center gap-2">
                  <CheckIcon className="size-5 text-brick" />
                  {text}
                </li>
              ),
            )}
          </ul>
        </section>

        {/* Questions */}
        <section id="questions" aria-labelledby="titre-questions" className="scroll-mt-4 px-4 py-20 sm:px-6">
          <div className="mx-auto flex max-w-[75rem] flex-wrap gap-12">
            <div className="flex-[1_1_18rem]">
              <h2
                id="titre-questions"
                className={`${TITLE} mb-4 text-[2.3rem] leading-[1.02] sm:text-[2.8rem]`}
              >
                {t("faq.title")}
              </h2>
              <p className="mb-6 text-[1.15rem]">{t("faq.intro")}</p>
              <a href={`mailto:${contact}`} className={`${LINK} font-semibold`}>
                {t("faq.contact")}
              </a>
            </div>
            <div className="flex flex-[2_1_26rem] flex-col gap-3.5">
              {faq.map((item, index) => (
                <details
                  key={item.q}
                  open={index === 0}
                  className="group rounded-[1.25rem] border-[1.5px] border-line bg-ivory transition-colors open:border-coral open:bg-white"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[1.15rem] font-semibold text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex size-[2.2rem] flex-none items-center justify-center rounded-full bg-blush text-rust transition group-open:rotate-45 group-open:bg-brick group-open:text-white">
                      <PlusIcon className="size-4" />
                    </span>
                  </summary>
                  <p className="px-6 pb-[1.4rem]">{answer(item.a)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Bandeau final */}
        <section className="px-3 pb-12 pt-4">
          <div className="relative mx-auto max-w-[74rem] overflow-hidden rounded-[3rem] bg-brick px-8 py-[4.5rem] text-center">
            <div
              aria-hidden="true"
              className="absolute -left-20 -top-20 size-64 rounded-full border-[2.5rem] border-[#dd5646]"
            />
            <div aria-hidden="true" className="absolute -bottom-12 -right-12 size-44 rounded-full bg-navy" />
            <div className="relative">
              <h2 className="mb-4 font-display text-[2.5rem] font-bold leading-none tracking-[-0.03em] text-white sm:text-[3.2rem]">
                {t("final.title")}
                <br />
                {t("final.titleEnd")}
              </h2>
              <p className="mx-auto mb-9 max-w-[34rem] text-[1.2rem] text-white">{t("final.text")}</p>
              <a
                href="#tarifs"
                className="group inline-flex min-h-11 items-center gap-2.5 rounded-full bg-white px-[1.9rem] py-[1.05rem] text-[1.1rem] font-semibold text-rust transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(70,15,8,.35)]"
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
