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
import { Bento } from "@/components/marketing/Bento";
import { HeroVisual } from "@/components/marketing/HeroVisual";
import { PlanCards } from "@/components/marketing/PlanCards";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { resolveLocale } from "@/i18n/translator";
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

const TITLE = "hn-balance font-display font-bold tracking-[-0.035em] text-night";
const BADGE =
  "inline-flex items-center gap-2 rounded-full border border-blush-strong bg-white/70 px-3.5 py-1.5 text-[0.9rem] font-medium text-rust backdrop-blur";
const PRIMARY =
  "group inline-flex items-center gap-2.5 rounded-full bg-brick px-[1.9rem] py-[1.05rem] text-[1.1rem] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(212,64,47,.7),inset_0_1px_0_rgba(255,255,255,.25)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_32px_-10px_rgba(212,64,47,.75),inset_0_1px_0_rgba(255,255,255,.25)]";

/**
 * Site commercial : accroche vivante, métiers, chiffres clés, trois étapes,
 * ce qui est compris (grille), packs (lus dans la base), questions, appel final.
 * Pensé d'abord pour le téléphone ; animations seulement si la personne les accepte.
 */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const [t, tLanding] = await Promise.all([getTranslations("home"), getTranslations("landing")]);
  const config = env();
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: await getPlatformSetting(tx, "prices_display"),
    commission: Number(await getPlatformSetting(tx, "deposit_commission_percent")),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    setupFee: Number(await getPlatformSetting(tx, "setup_fee_cents")),
    days: Number(await getPlatformSetting(tx, "go_live_delay_days")),
  }));
  const percent = data.commission;
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const faq = t.raw("faq.items") as Faq[];
  const trades = t.raw("madeFor.items") as string[];
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  const steps = [
    { key: "create", Icon: BrowserIcon, accent: false },
    { key: "book", Icon: CalendarCheckIcon, accent: true },
    { key: "cash", Icon: EuroIcon, accent: false },
  ] as const;
  const figures = [
    { key: "booking", value: tLanding("figures.booking.value") },
    { key: "commission", value: tLanding("figures.commission.value", { percent }) },
    { key: "delay", value: tLanding("figures.delay.value", { days: data.days }) },
    { key: "reminders", value: tLanding("figures.reminders.value") },
  ] as const;

  return (
    <div className="relative text-[1.05rem] leading-[1.55] text-body">
      {/* Halo coloré derrière l'accroche */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[56rem] overflow-hidden"
      >
        <div className="hn-blob absolute -left-40 -top-40 size-[34rem] rounded-full bg-blush-strong/60 blur-3xl" />
        <div
          className="hn-blob absolute -right-32 top-24 size-[28rem] rounded-full bg-[#ffd9c9]/70 blur-3xl"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="hn-blob absolute left-1/3 top-[30rem] size-[22rem] rounded-full bg-[#dfe5f2]/70 blur-3xl"
          style={{ animationDelay: "-12s" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(27,42,74,.08)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      </div>

      <PlatformHeader />
      <main id="contenu">
        {/* Accroche */}
        <section className="mx-auto flex max-w-6xl flex-wrap items-center gap-14 px-4 pb-24 pt-8 sm:px-6 lg:pt-14">
          <div className="hn-up flex-[1_1_27rem]">
            <p className={`${BADGE} mb-6`}>
              <span className="relative flex size-2">
                <span className="hn-ping absolute inline-flex size-full rounded-full bg-success" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              {t("badge")}
            </p>
            <h1 className={`${TITLE} mb-6 text-[2.8rem] leading-[0.98] sm:text-[4.2rem] lg:text-[4.6rem]`}>
              {t("title")} <span className="hn-squiggle text-brick">{t("titleAccent")}</span>
            </h1>
            <p className="hn-pretty mb-9 max-w-[31rem] text-xl text-body/90">{t("subtitle")}</p>
            <div className="mb-8 flex flex-wrap items-center gap-6">
              <a href="#tarifs" className={PRIMARY}>
                {t("cta")}
                <ArrowIcon className="size-5 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#tarifs"
                className="font-medium text-night underline decoration-blush-strong decoration-2 underline-offset-4 transition-colors hover:text-brick hover:decoration-brick"
              >
                {t("seePlans")}
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2.5 text-[0.98rem]">
              {[t("promises.commission", { percent }), t("promises.domain"), t("promises.install")].map(
                (text) => (
                  <li key={text} className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-blush text-brick">
                      <CheckIcon className="size-3.5" />
                    </span>
                    {text}
                  </li>
                ),
              )}
            </ul>
          </div>
          <HeroVisual />
        </section>

        {/* Métiers : bandeau défilant */}
        <section aria-labelledby="titre-metiers" className="pb-16">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-4 px-4 sm:px-6">
            <h2 id="titre-metiers" className="font-sans text-[1.05rem] font-semibold text-night">
              {t("madeFor.title")}
            </h2>
            <div className="hn-fade-x min-w-0 flex-1 overflow-hidden">
              <div className="hn-marquee flex">
                {[0, 1].map((copy) => (
                  <ul
                    key={copy}
                    className="flex flex-wrap gap-3 pr-3"
                    {...(copy ? { "data-copy": "", "aria-hidden": true } : {})}
                  >
                    {trades.map((item) => (
                      <li
                        key={item}
                        className="whitespace-nowrap rounded-full border-[1.5px] border-line bg-white px-[1.1rem] py-2 transition hover:border-coral hover:text-rust"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Chiffres clés */}
        <section aria-labelledby="titre-chiffres" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <h2 id="titre-chiffres" className="sr-only">
            {tLanding("figures.title")}
          </h2>
          <dl className="grid grid-cols-2 overflow-hidden rounded-[2rem] border border-line bg-white/70 backdrop-blur lg:grid-cols-4">
            {figures.map((figure, index) => (
              <div
                key={figure.key}
                className={`hn-reveal flex flex-col-reverse justify-end gap-2 p-5 sm:p-8 ${index % 2 === 1 ? "border-l border-line" : ""} ${index > 1 ? "border-t border-line lg:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`}
              >
                <dt className="hn-pretty text-[0.95rem] text-stone">
                  {tLanding(`figures.${figure.key}.label`)}
                </dt>
                <dd className="bg-gradient-to-br from-brick to-rust bg-clip-text font-display text-[1.75rem] font-bold leading-none tracking-[-0.03em] text-transparent sm:text-[2.8rem]">
                  {figure.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Trois étapes */}
        <section
          id="etapes"
          aria-labelledby="titre-etapes"
          className="hn-grain relative mx-3 scroll-mt-20 overflow-hidden rounded-[3rem] bg-navy px-4 py-[5.5rem] sm:px-6"
        >
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 size-[22rem] rounded-full border-[3rem] border-[#223460]"
          />
          <div
            aria-hidden="true"
            className="hn-blob absolute -bottom-16 -left-16 size-48 rounded-full bg-coral"
          />
          <div className="relative mx-auto max-w-6xl">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
              <h2
                id="titre-etapes"
                className="hn-balance font-display text-[2.6rem] font-bold leading-none tracking-[-0.03em] text-white sm:text-[3.4rem]"
              >
                {t("steps.title")}
                <br />
                <span className="text-salmon">{t("steps.titleAccent")}</span>
              </h2>
              <p className="hn-pretty max-w-sm text-xl text-[#d7dce6]">{t("steps.intro")}</p>
            </div>
            <ol className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(16.5rem,1fr))]">
              {steps.map(({ key, Icon, accent }, index) => (
                <li
                  key={key}
                  className={`hn-reveal flex flex-col gap-4 rounded-[1.75rem] p-8 transition duration-300 hover:-translate-y-2.5 hover:shadow-[0_28px_54px_rgba(0,0,0,.38)] ${accent ? "bg-brick" : "bg-white"}`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`flex size-[3.4rem] items-center justify-center rounded-[1.1rem] ${accent ? "bg-white text-brick" : "bg-navy text-white"}`}
                    >
                      <Icon className="size-[26px]" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`font-display text-[4.4rem] font-bold leading-[0.9] ${accent ? "text-white/90" : "text-coral"}`}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3
                    className={`mt-2 font-sans text-2xl font-semibold ${accent ? "text-white" : "text-night"}`}
                  >
                    {t(`steps.${key}.title`)}
                  </h3>
                  <p className={`hn-pretty flex-1 ${accent ? "text-white" : "text-body"}`}>
                    {t(`steps.${key}.text`)}
                  </p>
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

        {/* Ce qui est compris */}
        <section aria-labelledby="titre-compris" className="mx-auto max-w-6xl px-4 pt-[5.5rem] sm:px-6">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className={`${BADGE} mb-5`}>{tLanding("bento.badge")}</p>
              <h2 id="titre-compris" className={`${TITLE} text-[2.4rem] leading-none sm:text-[3.2rem]`}>
                {tLanding("bento.title")}
                <br />
                <span className="text-brick">{tLanding("bento.titleAccent")}</span>
              </h2>
            </div>
            <p className="hn-pretty max-w-sm text-[1.15rem]">{tLanding("bento.intro")}</p>
          </div>
          <Bento />
        </section>

        {/* Packs */}
        <section
          id="tarifs"
          aria-labelledby="titre-tarifs"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-[5.5rem] sm:px-6"
        >
          <div className="mb-14 text-center">
            <p className={`${BADGE} mb-5`}>{t("plans.badge")}</p>
            <h2 id="titre-tarifs" className={`${TITLE} mb-3 text-[2.4rem] leading-none sm:text-[3.2rem]`}>
              {t("plans.title")} <span className="text-brick">{t("plans.titleAccent", { percent })}</span>
            </h2>
            <p className="hn-pretty mx-auto max-w-[34rem] text-[1.15rem]">{t("plans.subtitle")}</p>
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
                  <span className="flex size-6 items-center justify-center rounded-full bg-blush text-brick">
                    <CheckIcon className="size-4" />
                  </span>
                  {text}
                </li>
              ),
            )}
          </ul>
        </section>

        {/* Questions */}
        <section id="questions" aria-labelledby="titre-questions" className="scroll-mt-20 px-4 pb-20 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-12">
            <div className="flex-[1_1_18rem] lg:sticky lg:top-28 lg:self-start">
              <h2
                id="titre-questions"
                className={`${TITLE} mb-4 text-[2.3rem] leading-[1.02] sm:text-[2.8rem]`}
              >
                {t("faq.title")}
              </h2>
              <p className="mb-6 text-[1.15rem]">{t("faq.intro")}</p>
              <a
                href={`mailto:${contact}`}
                className="group inline-flex items-center gap-2 rounded-full border-[1.5px] border-night px-5 py-2.5 font-semibold text-night transition hover:bg-night hover:text-white"
              >
                {t("faq.contact")}
                <ArrowIcon className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
            <div className="hn-faq flex flex-[2_1_26rem] flex-col gap-3.5">
              {faq.map((item, index) => (
                <details
                  key={item.q}
                  name="faq"
                  open={index === 0}
                  className="group rounded-[1.25rem] border-[1.5px] border-line bg-white/60 transition-colors open:border-coral open:bg-white open:shadow-[0_16px_40px_-24px_rgba(212,64,47,.5)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[1.15rem] font-semibold text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex size-[2.2rem] flex-none items-center justify-center rounded-full bg-blush text-rust transition duration-300 group-open:rotate-45 group-open:bg-brick group-open:text-white">
                      <PlusIcon className="size-4" />
                    </span>
                  </summary>
                  <p className="hn-pretty px-6 pb-[1.4rem]">
                    {item.a.replace("{commission}", t("faq.commission", { percent }))}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="px-3 pb-12 pt-4">
          <div className="hn-grain relative mx-auto max-w-[74rem] overflow-hidden rounded-[3rem] bg-brick px-8 py-20 text-center sm:py-24">
            <div
              aria-hidden="true"
              className="hn-blob absolute -left-20 -top-20 size-64 rounded-full border-[2.5rem] border-[#dd5646]"
            />
            <div
              aria-hidden="true"
              className="hn-blob absolute -bottom-12 -right-12 size-44 rounded-full bg-navy"
              style={{ animationDelay: "-9s" }}
            />
            <div className="hn-reveal relative">
              <h2 className="hn-balance mb-4 font-display text-[2.6rem] font-bold leading-[0.98] tracking-[-0.035em] text-white sm:text-[3.8rem]">
                {t("final.title")}
                <br />
                {t("final.titleEnd")}
              </h2>
              <p className="mx-auto mb-9 max-w-[34rem] text-xl text-white/90">{t("final.text")}</p>
              <a
                href="#tarifs"
                className="group inline-flex items-center gap-2.5 rounded-full bg-white px-[1.9rem] py-[1.05rem] text-[1.1rem] font-semibold text-rust shadow-[0_12px_26px_rgba(70,15,8,.25)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(70,15,8,.35)]"
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
