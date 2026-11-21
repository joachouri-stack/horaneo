import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ArrowLine, CheckLine } from "@/components/marketing/line-icons";
import { TRADE_PAGES, tradeBySlug } from "@/config/trades";
import { withPlatform } from "@/db/access";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { formatMoney } from "@/lib/format";
import { capitalize } from "@/lib/text";
import { listPublicPlans } from "@/modules/billing/plans";
import { salesOpen } from "@/modules/legal/documents";
import { getPlatformSetting } from "@/modules/settings";

const TITLE = "font-display font-semibold tracking-[-0.025em] text-night";
const HERO_PRIMARY =
  "group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(120deg,var(--color-violet),var(--color-azure-dark))] px-5 text-[1.0625rem] font-medium text-white shadow-[0_16px_36px_-14px_rgba(91,90,255,.85)] transition hover:-translate-y-px motion-reduce:transition-none";
const SECONDARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-hairline bg-white px-5 font-medium text-night transition hover:border-accent-line hover:text-accent";

type Benefit = { title: string; text: string };
type Question = { q: string; a: string };

export function generateStaticParams() {
  return TRADE_PAGES.map((trade) => ({ slug: trade.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/metiers/[slug]">): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const trade = tradeBySlug(slug);
  if (!trade) return {};
  const t = await getTranslations({ locale: resolveLocale(rawLocale), namespace: "trades" });
  return {
    title: t("metaTitle", { name: t(`items.${trade.key}.name`) }),
    description: t(`items.${trade.key}.metaDescription`),
    alternates: { canonical: `/${rawLocale}/metiers/${trade.slug}` },
  };
}

/**
 * Page d'un métier visé (institut, coiffeur…) : ce que le site et l'espace de gestion font
 * pour lui, des exemples de prestations, les étapes, le prix d'appel et ses questions.
 * Mêmes packs et mêmes réglages que l'accueil : rien n'est promis que les packs ne font pas.
 */
export default async function TradePage({ params }: PageProps<"/[locale]/metiers/[slug]">) {
  await connection();
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const trade = tradeBySlug(slug);
  if (!trade) notFound();
  const [t, tHome] = await Promise.all([getTranslations("trades"), getTranslations("home")]);
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: String(await getPlatformSetting(tx, "prices_display")),
    trialDays: Number(await getPlatformSetting(tx, "trial_days")),
    goLiveDays: Number(await getPlatformSetting(tx, "go_live_delay_days")),
    salesOpen: await salesOpen(tx),
  }));
  // Prix d'appel : le moins cher des packs payants (le gratuit n'a pas de site créé pour vous).
  const paid = data.plans.filter((plan) => plan.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents);
  const first = paid[0];
  const startHref = data.salesOpen
    ? { pathname: "/commander" as const, query: first ? { pack: first.code } : {} }
    : { pathname: "/rappel" as const };
  const ctaLabel = !data.salesOpen
    ? tHome("plans.callback")
    : data.trialDays > 0
      ? tHome("hero.ctaTrial")
      : tHome("cta");
  const key = trade.key;
  const name = t(`items.${key}.name`);
  const benefits = t.raw(`items.${key}.benefits`) as Benefit[];
  const services = t.raw(`items.${key}.services`) as string[];
  const questions = t.raw(`items.${key}.faq`) as Question[];
  const others = TRADE_PAGES.filter((item) => item.slug !== trade.slug);

  const cta = (
    <div className="flex flex-col gap-2">
      <Link href={startHref} className={HERO_PRIMARY}>
        {ctaLabel}
        <ArrowLine className="size-[18px] transition-transform group-hover:translate-x-0.5" />
      </Link>
      {data.salesOpen && data.trialDays > 0 && (
        <p className="text-mk-note opacity-70">{tHome("hero.trialNote", { days: data.trialDays })}</p>
      )}
    </div>
  );

  return (
    <div className="bg-white text-mk-body font-light text-[#3d4457]">
      <PlatformHeader />
      <main id="contenu">
        {/* Accroche sur fond bleu nuit, comme l'accueil. */}
        <section className="relative overflow-hidden bg-deep text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(46rem_26rem_at_10%_-10%,rgba(123,63,228,.35),transparent_70%),radial-gradient(40rem_24rem_at_100%_110%,rgba(47,128,255,.28),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-[60rem] px-4 pb-14 pt-10 sm:px-6 lg:pb-20 lg:pt-16">
            <p className="inline-flex rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-mk-note font-medium text-white/90">
              {t("badge", { name })}
            </p>
            <h1 className="mt-5 font-display text-[clamp(2rem,8vw,3.25rem)] font-semibold leading-[1.06] tracking-[-0.025em]">
              <span className="block">{t(`items.${key}.title`)}</span>
              <span className="hn-grad-text block">{t(`items.${key}.accent`)}</span>
            </h1>
            <p className="mt-5 max-w-[42rem] text-mk-lead leading-relaxed text-white/75">
              {t(`items.${key}.intro`)}
            </p>
            <div className="mt-8 max-w-[34rem]">{cta}</div>
          </div>
        </section>

        {/* Ce qui change pour ce métier. */}
        <section aria-labelledby="titre-benefices" className="px-4 pt-14 sm:px-6 lg:pt-20">
          <div className="mx-auto max-w-[72rem]">
            <h2 id="titre-benefices" className={`${TITLE} text-center text-mk-h2 leading-[1.1]`}>
              {t("benefitsTitle")}
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-3 lg:gap-6">
              {benefits.map((benefit) => (
                <li
                  key={benefit.title}
                  className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_16px_32px_-24px_rgba(15,24,48,.35)] sm:p-6"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-[#efeaff] text-violet">
                    <CheckLine className="size-5" />
                  </span>
                  <h3 className="mt-4 font-display text-mk-card font-semibold tracking-[-0.015em] text-night">
                    {benefit.title}
                  </h3>
                  <p className="mt-2 text-ink-soft">{benefit.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Exemples de prestations. */}
        <section aria-labelledby="titre-prestations" className="px-4 pt-14 sm:px-6 lg:pt-20">
          <div className="mx-auto max-w-[60rem] text-center">
            <h2 id="titre-prestations" className={`${TITLE} text-mk-h2 leading-[1.1]`}>
              {t("servicesTitle")}
            </h2>
            <p className="mt-3 text-ink-soft">{t("servicesText")}</p>
            <ul className="mt-8 flex flex-wrap justify-center gap-2.5">
              {services.map((service) => (
                <li
                  key={service}
                  className="rounded-full border border-hairline bg-white px-4 py-2 font-medium text-night shadow-[0_6px_16px_-12px_rgba(15,24,48,.35)]"
                >
                  {service}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Les étapes, comme sur l'accueil. */}
        <section aria-labelledby="titre-etapes" className="px-4 pt-14 sm:px-6 lg:pt-20">
          <div className="mx-auto max-w-[72rem]">
            <h2 id="titre-etapes" className={`${TITLE} text-center text-mk-h2 leading-[1.1]`}>
              {t("stepsTitle")}
            </h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-3 lg:gap-6">
              {(["choose", "create", "book"] as const).map((step, index) => (
                <li key={step} className="rounded-2xl border border-hairline bg-white p-5 sm:p-6">
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-violet),var(--color-azure-dark))] font-display text-lg font-semibold text-white"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-display text-mk-card font-semibold text-night">
                    {tHome(`steps.items.${step}.title`)}
                  </h3>
                  <p className="mt-2 text-ink-soft">
                    {tHome(`steps.items.${step}.text`, {
                      trial: data.trialDays > 0 ? "yes" : "no",
                      days: data.goLiveDays,
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Prix d'appel et liens vers les tarifs et le comparatif. */}
        <section aria-labelledby="titre-prix" className="px-4 pt-14 sm:px-6 lg:pt-20">
          <div className="mx-auto max-w-[60rem] rounded-[1.6rem] bg-mist-50 px-5 py-8 text-center sm:px-10">
            <h2 id="titre-prix" className={`${TITLE} text-mk-h2 leading-[1.1]`}>
              {t("pricesTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-[40rem] text-ink-soft">
              {t("pricesText", {
                price: first ? formatMoney(first.priceCents, first.currency, locale) : "none",
                display: data.display,
              })}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={{ pathname: "/", hash: "tarifs" }} className={SECONDARY}>
                {t("seePrices")}
              </Link>
              <Link href="/comparatif" className={SECONDARY}>
                {t("compare")}
              </Link>
            </div>
          </div>
        </section>

        {/* Questions propres au métier. */}
        <section aria-labelledby="titre-faq" className="px-4 pt-14 sm:px-6 lg:pt-20">
          <div className="mx-auto max-w-[48rem]">
            <h2 id="titre-faq" className={`${TITLE} text-center text-mk-h2 leading-[1.1]`}>
              {t("faqTitle")}
            </h2>
            <div className="mt-8 divide-y divide-hairline rounded-2xl border border-hairline bg-white">
              {questions.map((item) => (
                <details key={item.q} className="group px-5 py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-medium text-night [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ArrowLine className="size-4 flex-none rotate-90 transition-transform group-open:-rotate-90" />
                  </summary>
                  <p className="pb-4 text-ink-soft">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Dernier appel, puis les autres métiers. */}
        <section className="px-4 pb-16 pt-14 sm:px-6 lg:pb-24 lg:pt-20">
          <div className="mx-auto max-w-[60rem] rounded-[1.6rem] bg-deep px-5 py-10 text-center text-white sm:px-10">
            <h2 className="font-display text-mk-h2 font-semibold leading-[1.1] tracking-[-0.025em]">
              {t("finalTitle")}
            </h2>
            <div className="mx-auto mt-6 max-w-[30rem]">{cta}</div>
          </div>
          <nav aria-labelledby="autres-metiers" className="mx-auto mt-10 max-w-[60rem] text-center">
            <h2 id="autres-metiers" className="text-mk-small font-medium text-night">
              {t("otherTrades")}
            </h2>
            <ul className="mt-3 flex flex-wrap justify-center gap-2">
              {others.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={`/metiers/${item.slug}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-hairline px-4 font-medium text-night hover:border-accent-line hover:text-accent"
                  >
                    {capitalize(t(`items.${item.key}.name`), locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
