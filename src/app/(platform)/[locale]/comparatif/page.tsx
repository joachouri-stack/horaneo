import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { ArrowIcon, CheckIcon, DashIcon } from "@/components/marketing/icons";
import { withPlatform } from "@/db/access";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { formatMoney } from "@/lib/format";
import { planCardContent, type PlansTranslator } from "@/modules/billing/plan-card";
import { listPublicPlans } from "@/modules/billing/plans";
import { comparisonLines, SHOWCASE_GROUPS, splitPlans } from "@/modules/billing/showcase";
import { smsPackOffer } from "@/modules/billing/sms-packs";
import { salesOpen } from "@/modules/legal/documents";
import { getPlatformSetting } from "@/modules/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/comparatif">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "home.compare" });
  return { title: t("metaTitle"), description: t("intro") };
}

const TITLE = "font-display font-bold tracking-[-0.03em] text-night";

/**
 * Tableau comparatif des packs : une table par famille (avec réservation,
 * site seul), lignes rangées en six groupes. Tout est calculé à partir des
 * réglages des packs, comme les cartes de la page d'accueil.
 */
export default async function ComparePage({ params }: PageProps<"/[locale]/comparatif">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const [t, tPlans] = await Promise.all([getTranslations("home.compare"), getTranslations("home.plans")]);
  const data = await withPlatform(async (tx) => ({
    plans: await listPublicPlans(tx),
    commitment: Number(await getPlatformSetting(tx, "commitment_months")),
    soon: await getPlatformSetting(tx, "features_soon"),
    smsPack: await smsPackOffer(tx),
    salesOpen: await salesOpen(tx),
  }));
  const soon = new Set<string>(data.soon);
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  const translate = tPlans as unknown as PlansTranslator;
  const { booking, siteOnly } = splitPlans(data.plans);
  const families = [
    { key: "booking", title: tPlans("toggleBooking"), plans: booking },
    { key: "site", title: tPlans("toggleSite"), plans: siteOnly },
  ].filter((family) => family.plans.length > 0);

  return (
    <div className="text-base leading-[1.6] text-body">
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-[75rem] px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
        <Link
          href={{ pathname: "/", hash: "tarifs" }}
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-night underline underline-offset-4 hover:text-brick"
        >
          <ArrowIcon className="size-4 rotate-180" />
          {t("back")}
        </Link>
        <h1 className={`${TITLE} mt-4 text-[clamp(1.9rem,3.6vw,2.75rem)] leading-[1.05]`}>
          {t("title")} <span className="text-brick">{t("titleAccent")}</span>
        </h1>
        <p className="mt-3 max-w-[40rem] text-[1.05rem]">{t("intro")}</p>
        {data.commitment > 0 && (
          <p className="mt-2 text-[0.95rem] text-stone">{t("withCommitment", { months: data.commitment })}</p>
        )}

        {families.map((family) => {
          const lines = comparisonLines(family.plans, soon);
          const cards = family.plans.map((plan) =>
            planCardContent(plan, data.plans, {
              t: translate,
              locale,
              soon,
              smsPack: data.smsPack,
              salesOpen: data.salesOpen,
            }),
          );
          return (
            <section key={family.key} aria-labelledby={`famille-${family.key}`} className="mt-12">
              <h2 id={`famille-${family.key}`} className={`${TITLE} mb-4 text-[1.5rem]`}>
                {family.title}
              </h2>
              {/* Téléphone : le tableau défile de côté, la première colonne reste visible. */}
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[36rem] border-separate border-spacing-0 text-left text-[0.92rem]">
                  <caption className="sr-only">{family.title}</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 w-[40%] bg-ivory p-3 align-bottom font-semibold text-stone"
                      >
                        {t("feature")}
                      </th>
                      {family.plans.map((plan, index) => (
                        <th
                          key={plan.id}
                          scope="col"
                          className="border-b-2 border-line p-3 text-center align-bottom"
                        >
                          <span className="block font-display text-[1.15rem] font-bold text-night">
                            {pickLocalized(plan.name, locale)}
                          </span>
                          <span className="block text-[0.95rem] font-semibold text-navy">
                            {cards[index].price}{" "}
                            <span className="font-normal text-stone">{cards[index].priceSuffix}</span>
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.commitment > 0 && family.plans.some((plan) => plan.priceCents > 0) && (
                      <tr>
                        <th
                          scope="row"
                          className="sticky left-0 border-b border-line bg-ivory p-3 font-medium text-night"
                        >
                          {t("creationFee")}
                        </th>
                        {family.plans.map((plan) => (
                          <td key={plan.id} className="border-b border-line p-3 text-center">
                            {plan.priceCents > 0 && (plan.noCommitmentFeeCents ?? 0) > 0
                              ? money(plan.noCommitmentFeeCents ?? 0)
                              : t("creationFree")}
                          </td>
                        ))}
                      </tr>
                    )}
                    {SHOWCASE_GROUPS.map((group) => {
                      const rows = lines.filter((row) => row.group === group);
                      if (rows.length === 0) return null;
                      return [
                        <tr key={group}>
                          <th
                            scope="colgroup"
                            colSpan={family.plans.length + 1}
                            className="sticky left-0 bg-ivory px-3 pb-2 pt-6 text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-navy"
                          >
                            {tPlans(`groups.${group}`)}
                          </th>
                        </tr>,
                        ...rows.map((row) => (
                          <tr key={`${group}-${row.key}`}>
                            <th
                              scope="row"
                              className="sticky left-0 border-b border-line bg-ivory p-3 font-normal text-night"
                            >
                              {row.valued
                                ? t(`rows.${row.key}` as "rows.photos")
                                : tPlans(`lines.${row.key}` as "lines.agenda")}
                              {row.soon && (
                                <span className="ml-2 inline-block rounded-full bg-blush px-2 py-px align-middle text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-rust">
                                  {tPlans("soonTag")}
                                </span>
                              )}
                            </th>
                            {row.cells.map((cell, index) => (
                              <td
                                key={family.plans[index].id}
                                className="border-b border-line p-3 text-center"
                              >
                                {cell === null ? (
                                  <>
                                    <DashIcon className="mx-auto size-4 text-[#b5afa4]" />
                                    <span className="sr-only">{t("notIncluded")}</span>
                                  </>
                                ) : row.valued ? (
                                  <span className="font-semibold text-night">
                                    {cell.key.endsWith("Unlimited")
                                      ? t("unlimited")
                                      : String(cell.values?.count ?? "")}
                                  </span>
                                ) : (
                                  <>
                                    <CheckIcon className="mx-auto size-4 text-coral" />
                                    <span className="sr-only">{t("included")}</span>
                                  </>
                                )}
                              </td>
                            ))}
                          </tr>
                        )),
                      ];
                    })}
                    <tr>
                      <td className="sticky left-0 bg-ivory p-3" />
                      {cards.map((card) => (
                        <td key={card.code} className="p-3 text-center">
                          <Link
                            href={card.cta.href as { pathname: "/commander"; query: Record<string, string> }}
                            className="inline-flex min-h-11 items-center justify-center rounded-full bg-mist px-4 text-[0.9rem] font-semibold text-navy transition hover:bg-navy hover:text-white"
                          >
                            {card.cta.label}
                          </Link>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
      <PlatformFooter />
    </div>
  );
}
