import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { PhoneMockup } from "@/components/marketing/PhoneMockup";
import { ui } from "@/components/ui/styles";
import { env, publicAppUrl } from "@/config/env";
import { withPlatform } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { ENABLED_LOCALES } from "@/i18n/enabled";
import { resolveLocale } from "@/i18n/translator";
import { listPublicPlans, planHighlights } from "@/modules/billing/plans";
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

type CompareRow = { figure: string; without: string; with: string };
type Item = { title: string; text: string };
type Faq = { q: string; a: string };

/**
 * Site commercial : accroche et visuel de réservation, comparatif, fonctions,
 * packs (lus dans la base), questions fréquentes. Pensé d'abord pour le téléphone.
 */
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const [t, tPlans] = await Promise.all([getTranslations("home"), getTranslations("manager.subscription")]);
  const product = env().PRODUCT_NAME;
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    display: await getPlatformSetting(tx, "prices_display"),
    commission: Number(await getPlatformSetting(tx, "deposit_commission_percent")),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    setupFee: Number(await getPlatformSetting(tx, "setup_fee_cents")),
    days: Number(await getPlatformSetting(tx, "go_live_delay_days")),
  }));
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const fill = (text: string) =>
    text
      .replaceAll("{product}", product)
      .replaceAll("{percent}", String(data.commission))
      .replaceAll("{days}", String(data.days))
      .replaceAll("{commitment}", t("plans.commitment", { months: data.commitment }));
  const rows = t.raw("compare.rows") as CompareRow[];
  const features = t.raw("features.items") as Item[];
  const faq = t.raw("faq.items") as Faq[];
  // Le pack mis en avant : le payant le moins cher.
  const highlighted = data.plans.find((plan) => plan.priceCents > 0)?.id;

  return (
    <>
      <PlatformHeader />
      <main id="contenu">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">{t("title")}</h1>
            <p className="mt-6 max-w-2xl text-lg text-ink/85">{t("subtitle")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/commander" className={`${ui.primaryButton} sm:w-auto`}>
                {t("cta")}
              </Link>
              <a href="#packs" className={`${ui.secondaryButton} sm:w-auto`}>
                {t("seePlans")}
              </a>
            </div>
            <p className="mt-4 text-sm text-ink/70">{t("reassurance")}</p>
          </div>
          <PhoneMockup locale={locale} />
        </section>

        <section className="bg-white py-16" aria-labelledby="comparatif">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="comparatif" className="text-3xl font-extrabold">
              {t("compare.title")}
            </h2>
            <div className="mt-8 grid gap-4">
              <div className="hidden grid-cols-[10rem_1fr_1fr] gap-4 px-4 text-sm font-bold uppercase text-ink/60 md:grid">
                <span />
                <span>{t("compare.without", { product })}</span>
                <span>{t("compare.with", { product })}</span>
              </div>
              {rows.map((row) => (
                <div
                  key={row.figure}
                  className="grid gap-3 rounded-[var(--radius-card)] bg-ivory p-4 md:grid-cols-[10rem_1fr_1fr] md:items-center md:gap-4"
                >
                  <p className="font-display text-3xl font-extrabold text-coral-dark">{fill(row.figure)}</p>
                  <p className="text-ink/75">
                    <span className="font-semibold md:hidden">{t("compare.without", { product })} : </span>
                    {row.without}
                  </p>
                  <p className="font-semibold text-navy">
                    <span className="md:hidden">{t("compare.with", { product })} : </span>
                    {row.with}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="fonctions">
          <h2 id="fonctions" className="text-3xl font-extrabold">
            {t("features.title")}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => (
              <li key={item.title} className={ui.card}>
                <h3 className="text-lg font-bold text-navy">{item.title}</h3>
                <p className="mt-2 text-ink/80">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="packs" className="scroll-mt-4 bg-white py-16" aria-labelledby="titre-packs">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="titre-packs" className="text-3xl font-extrabold">
              {t("plans.title")}
            </h2>
            <p className="mt-2 text-ink/75">
              {t("plans.commitment", { months: data.commitment })}{" "}
              {data.setupFee > 0
                ? t("plans.setupFee", { amount: money(data.setupFee) })
                : t("plans.setupFree")}
            </p>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {data.plans.map((plan) => (
                <article
                  key={plan.id}
                  className={`flex flex-col rounded-[var(--radius-card)] border-2 bg-ivory p-6 ${plan.id === highlighted ? "border-coral" : "border-transparent"}`}
                >
                  {plan.id === highlighted && (
                    <p className="mb-2 text-sm font-bold uppercase text-coral-dark">{t("plans.popular")}</p>
                  )}
                  <h3 className="text-2xl font-extrabold text-navy">{pickLocalized(plan.name, locale)}</h3>
                  <p className="mt-2">
                    {plan.priceCents > 0 ? (
                      <>
                        <span className="font-display text-4xl font-extrabold">{money(plan.priceCents)}</span>{" "}
                        <span className="text-ink/70">{t("plans.perMonth", { display: data.display })}</span>
                      </>
                    ) : (
                      <span className="font-display text-4xl font-extrabold">{t("plans.free")}</span>
                    )}
                  </p>
                  <ul className="mt-4 flex-1 space-y-1 text-ink/85">
                    {planHighlights(plan).map((item) => (
                      <li key={item.key}>
                        ✓{" "}
                        {item.kind === "limit"
                          ? tPlans(`limits.${item.key}`, { count: item.count })
                          : tPlans(`features.${item.key}`)}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={{ pathname: "/commander", query: { pack: plan.code } }}
                    className={`mt-6 ${plan.id === highlighted ? ui.primaryButton : ui.secondaryButton}`}
                  >
                    {t("plans.order")}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-16" aria-labelledby="faq">
          <h2 id="faq" className="text-3xl font-extrabold">
            {t("faq.title")}
          </h2>
          <div className="mt-8 space-y-3">
            {faq.map((item) => (
              <details key={item.q} className={`${ui.card} group`}>
                <summary className="cursor-pointer list-none text-lg font-bold text-navy">
                  <span className="mr-2 inline-block transition group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                  {item.q}
                </summary>
                <p className="mt-3 text-ink/85">{fill(item.a)}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <PlatformFooter />
    </>
  );
}
