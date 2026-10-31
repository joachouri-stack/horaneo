import { getTranslations } from "next-intl/server";
import { PLATFORM_CURRENCY } from "@/config/billing";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { gridComparison, type GridCategory } from "@/modules/billing/grid";
import { yearlyPriceCents } from "@/modules/billing/yearly";
import {
  CalendarLine,
  CapLine,
  CardLine,
  ChartLine,
  CheckLine,
  DashLine,
  HeadsetLine,
  LayoutLine,
  MegaphoneLine,
  MessageLine,
  ServerLine,
  SparkleLine,
  StoreLine,
  UsersLine,
} from "./line-icons";
import { PackColumns } from "./SolutionScope";

const ICONS: Record<GridCategory, typeof CheckLine> = {
  site: LayoutLine,
  booking: CalendarLine,
  commerce: StoreLine,
  formation: CapLine,
  crm: UsersLine,
  marketing: MegaphoneLine,
  payments: CardLine,
  ai: SparkleLine,
  messaging: MessageLine,
  stats: ChartLine,
  hosting: ServerLine,
  support: HeadsetLine,
};

type ComparePlan = {
  id: string;
  code: string;
  name: LocalizedText;
  priceCents: number;
  features: PlanFeatures;
  limits: PlanLimits;
};

/**
 * Comparatif détaillé, par catégorie, calculé avec la même source que les
 * cartes et les droits des abonnés (réglages des packs). Les lignes propres à
 * une solution n'apparaissent qu'avec elle. Téléphone : un pack à la fois.
 */
export async function Comparison({
  plans,
  locale,
  soon,
  display,
  yearly,
}: {
  plans: ComparePlan[];
  locale: Locale;
  soon: string[];
  display: string;
  /** Prix annuels affichés quand « Annuel » est choisi (absent : mensuels seulement). */
  yearly?: { enabled: boolean; freeMonths: number };
}) {
  const [t, tGrid, tPlans] = await Promise.all([
    getTranslations("home.comparison"),
    getTranslations("home.grid"),
    getTranslations("home.plans"),
  ]);
  const groups = gridComparison(plans, new Set(soon));
  const money = (cents: number) => formatMoney(cents, PLATFORM_CURRENCY, locale);
  // Même pack mis en avant que sur les cartes : celui du milieu dans une grille de trois, sinon le dernier.
  const featured = plans.length >= 3 ? Math.floor(plans.length / 2) : plans.length - 1;
  const col = (index: number) => (index === featured ? "bg-champagne-soft/50" : "");

  return (
    <PackColumns packs={plans.map((plan) => pickLocalized(plan.name, locale))} label={t("pickPack")}>
      <div className="overflow-hidden rounded-[1.4rem] border border-hairline bg-white">
        <table className="w-full border-collapse text-left text-[1.0625rem]">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="p-4 font-display text-[1.0625rem] font-semibold text-night lg:px-6">
                {t("feature")}
              </th>
              {plans.map((plan, index) => (
                <th
                  key={plan.id}
                  scope="col"
                  data-col={index}
                  className={`w-[22%] p-4 text-center align-bottom md:w-[17%] ${col(index)}`}
                >
                  <span className="block font-display text-mk-card font-semibold text-night">
                    {pickLocalized(plan.name, locale)}
                  </span>
                  <span
                    data-billing-only={plan.priceCents > 0 && yearly?.enabled ? "month" : undefined}
                    className="block text-[0.9375rem] font-normal text-ink-soft"
                  >
                    {plan.priceCents > 0
                      ? `${money(plan.priceCents)} ${tPlans("perMonth", { display })}`
                      : tPlans("free")}
                  </span>
                  {plan.priceCents > 0 && yearly?.enabled && (
                    <span
                      data-billing-only="year"
                      className="block text-[0.9375rem] font-normal text-ink-soft"
                    >
                      {money(yearlyPriceCents(plan.priceCents, yearly.freeMonths))}{" "}
                      {tPlans("perYear", { display })}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => {
            const Icon = ICONS[group.category];
            const solutions = new Set(group.rows.map((row) => row.solution));
            const only = solutions.size === 1 ? [...solutions][0] : null;
            return (
              <tbody key={group.category} data-only={only ?? undefined}>
                <tr>
                  <th
                    scope="colgroup"
                    colSpan={plans.length + 1}
                    className="bg-mist-50/70 px-4 pb-2 pt-5 text-[0.875rem] font-medium uppercase tracking-[0.07em] text-accent-strong lg:px-6"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="size-4" />
                      {tGrid(`categories.${group.category}`)}
                    </span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr
                    key={row.key}
                    data-only={row.solution ?? undefined}
                    className="border-t border-hairline"
                  >
                    <th scope="row" className="px-4 py-3 font-normal text-[#2d3446] lg:px-6">
                      {tGrid(`rows.${row.key}.label` as "rows.photos.label")}
                      {row.soon && (
                        <span className="ml-2 inline-block rounded-full bg-mist-50 px-2 py-px align-[1px] text-[0.875rem] text-ink-soft">
                          {tPlans("soonTag")}
                        </span>
                      )}
                    </th>
                    {row.cells.map((cell, index) => (
                      <td
                        key={plans[index].id}
                        data-col={index}
                        className={`px-3 py-3 text-center ${col(index)}`}
                      >
                        {!cell.included ? (
                          <>
                            <DashLine className="mx-auto size-4 text-[#b9bfcc]" />
                            <span className="sr-only">{tGrid("notIncluded")}</span>
                          </>
                        ) : cell.count === undefined ? (
                          <>
                            <CheckLine className="mx-auto size-[18px] text-accent" />
                            <span className="sr-only">{tGrid("included")}</span>
                          </>
                        ) : (
                          <span className="font-medium text-night">
                            {cell.count === null ? tGrid("unlimited") : cell.count}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            );
          })}
        </table>
      </div>
    </PackColumns>
  );
}
