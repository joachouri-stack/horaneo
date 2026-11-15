import { getTranslations } from "next-intl/server";
import { PLATFORM_CURRENCY } from "@/config/billing";
import { pickLocalized, type Locale, type LocalizedText } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
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

export const CATEGORY_ICONS: Record<GridCategory, typeof CheckLine> = {
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
  // Fonctions annoncées (« Bientôt ») : regroupées à la fin, sans quantités, pour que le
  // tableau montre d'abord ce que chaque pack comprend aujourd'hui.
  const all = gridComparison(plans, new Set(soon));
  const groups = all
    .map((group) => ({ ...group, rows: group.rows.filter((row) => !row.soon) }))
    .filter((group) => group.rows.length > 0);
  const upcoming = all.flatMap((group) => group.rows.filter((row) => row.soon));
  const money = (cents: number) => formatMoney(cents, PLATFORM_CURRENCY, locale, { cents: true });
  const withYearly = Boolean(yearly?.enabled);
  // Même pack mis en avant que sur les cartes : celui du milieu dans une grille de trois, sinon le dernier.
  const featured = plans.length >= 3 ? Math.floor(plans.length / 2) : plans.length - 1;
  const col = (index: number) => (index === featured ? "bg-champagne-soft/50" : "");

  const cellOf = (cell: (typeof all)[number]["rows"][number]["cells"][number], index: number) => (
    <td key={plans[index].id} data-col={index} className={`px-3 py-3 text-center ${col(index)}`}>
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
  );

  return (
    <PackColumns packs={plans.map((plan) => pickLocalized(plan.name, locale))} label={t("pickPack")}>
      {/* overflow-clip (et non hidden) : coins arrondis sans empêcher l'en-tête de rester collé en haut. */}
      <div className="overflow-clip rounded-[1.4rem] border border-hairline bg-white">
        <table className="w-full border-collapse text-left text-[1.0625rem]">
          <caption className="sr-only">{t("title")}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th
                scope="col"
                className="bg-white p-4 font-display text-[1.0625rem] font-semibold text-night md:sticky md:top-[4.25rem] md:z-10 lg:top-[4.75rem] lg:px-6"
              >
                {t("feature")}
              </th>
              {plans.map((plan, index) => (
                <th
                  key={plan.id}
                  scope="col"
                  data-col={index}
                  className={`w-[22%] p-4 text-center align-bottom md:sticky md:top-[4.25rem] md:z-10 md:w-[17%] lg:top-[4.75rem] ${index === featured ? "bg-champagne-soft" : "bg-white"}`}
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
            const Icon = CATEGORY_ICONS[group.category];
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
                    {row.cells.map((cell, index) => cellOf(cell, index))}
                  </tr>
                ))}
              </tbody>
            );
          })}
          {upcoming.length > 0 && (
            <tbody>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={plans.length + 1}
                  className="bg-mist-50/70 px-4 pb-2 pt-5 text-left lg:px-6"
                >
                  <span className="flex items-center gap-2 text-[0.875rem] font-medium uppercase tracking-[0.07em] text-accent-strong">
                    <SparkleLine className="size-4" />
                    {t("upcoming")}
                  </span>
                  <span className="mt-1 block text-[0.9375rem] font-normal normal-case tracking-normal text-ink-soft">
                    {t("upcomingHint")}
                  </span>
                </th>
              </tr>
              {upcoming.map((row) => (
                <tr key={row.key} data-only={row.solution ?? undefined} className="border-t border-hairline">
                  <th scope="row" className="px-4 py-3 font-normal text-ink-soft lg:px-6">
                    {tGrid(`rows.${row.key}.label` as "rows.photos.label")}
                  </th>
                  {/* Sans quantités : seulement les packs qui l'auront. */}
                  {row.cells.map((cell, index) => cellOf(cell.included ? { included: true } : cell, index))}
                </tr>
              ))}
            </tbody>
          )}
          {/* Commander depuis le comparatif, sous chaque pack. */}
          <tfoot>
            <tr className="border-t border-hairline">
              <td className="p-4 lg:px-6" />
              {plans.map((plan, index) => {
                const link =
                  "inline-flex min-h-11 w-full items-center justify-center rounded-xl px-2 text-[0.9375rem] font-medium transition";
                const style =
                  index === featured
                    ? "bg-[linear-gradient(120deg,var(--color-violet),var(--color-azure-dark))] text-white hover:brightness-110"
                    : "border border-accent-line text-night hover:border-accent";
                return (
                  <td key={plan.id} data-col={index} className={`p-3 text-center ${col(index)}`}>
                    <Link
                      href={{ pathname: "/commander", query: { pack: plan.code } }}
                      data-billing-only={withYearly && plan.priceCents > 0 ? "month" : undefined}
                      className={`${link} ${style}`}
                    >
                      {t("order")}
                    </Link>
                    {withYearly && plan.priceCents > 0 && (
                      <Link
                        href={{ pathname: "/commander", query: { pack: plan.code, billing: "year" } }}
                        data-billing-only="year"
                        className={`${link} ${style}`}
                      >
                        {t("order")}
                      </Link>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </PackColumns>
  );
}
