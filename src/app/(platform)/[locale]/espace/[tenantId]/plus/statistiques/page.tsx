import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextField } from "@/components/admin/fields";
import {
  DASH_ICONS,
  DashIcon,
  Donut,
  panel,
  RevenueBars,
  SplitBar,
  StatCard,
  Trend,
} from "@/components/manager/DashboardWidgets";
import { BarChart, GoalRing, HourHeat, LineChart, MiniGoalRing } from "@/components/manager/StatsCharts";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { firstPlanWith } from "@/modules/billing/plans";
import { addDays, utcToLocal } from "@/modules/booking/time";
import { getStatsGoals } from "@/modules/stats/goals";
import { trendPercent } from "@/modules/stats/dashboard";
import type { SalesBreakdown } from "@/modules/stats/margins";
import { monthDetails, monthOccupancy, monthSales, monthStats } from "@/modules/stats/month";
import { updateStatsGoalsAction } from "../../actions";

const shift = (period: string, delta: number) => {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const ONLINE = "#3a4bb8";
const SALON = "#e2708f";
const REVENUE = "#2fa58b";
const MONDAY = "2024-01-01"; // un lundi, pour nommer les jours de la semaine

/**
 * Statistiques du mois : chiffres clés comparés au mois précédent ; avec le pack
 * qui les inclut, objectifs du mois, courbes jour par jour, répartitions
 * (prestations, équipe, canal, clientes) et heures les plus demandées.
 */
export default async function StatsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/statistiques">) {
  const page = await managerPage(params, "stats");
  const t = await getTranslations("manager.stats");
  const tCommon = await getTranslations("common");
  const tz = page.tenant.timezone;
  const current = utcToLocal(new Date(), tz).date.slice(0, 7);
  const query = await searchParams;
  const requested = query.mois;
  // Deux onglets : chiffre d'affaires (par défaut) ou rendez-vous ; un seul est calculé et affiché.
  const tab: "ca" | "rdv" = query.vue === "rdv" ? "rdv" : "ca";
  const statsLink = (month: string, view: "ca" | "rdv" = tab) =>
    `${page.base}/plus/statistiques?mois=${month}${view === "rdv" ? "&vue=rdv" : ""}`;
  const period =
    typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= current
      ? requested
      : current;
  // Consulter le chiffre d'affaires d'un jour (« jour ») ou d'un mois (« caMoisM » + « caMoisA »).
  const today = utcToLocal(new Date(), tz).date;
  const lookupDay =
    typeof query.jour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.jour) && query.jour <= today
      ? query.jour
      : null;
  const lookupMonthRaw =
    typeof query.caMoisA === "string" && typeof query.caMoisM === "string"
      ? `${query.caMoisA}-${query.caMoisM.padStart(2, "0")}`
      : null;
  const lookupMonth =
    lookupMonthRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(lookupMonthRaw) && lookupMonthRaw <= current
      ? lookupMonthRaw
      : null;
  const detailed = Boolean(page.tenant.features.stats);
  // Remplissage, chiffre d'affaires et marge par prestation / produit : fonction de pack à part (Business).
  const insights = detailed && Boolean(page.tenant.features.performanceInsights);
  const { stats, previous, older, details, goals, sales, occupancy, dayLookup, monthLookup } = await page.db(
    async (tx) => ({
      stats: await monthStats(tx, page.tenantId, period, tz, page.locale),
      previous: await monthStats(tx, page.tenantId, shift(period, -1), tz, page.locale),
      // Mois −5 à −2 (avec « previous ») : cercles des 3 mois précédents et graphique des 6 derniers mois.
      older: [
        await monthStats(tx, page.tenantId, shift(period, -5), tz, page.locale),
        await monthStats(tx, page.tenantId, shift(period, -4), tz, page.locale),
        await monthStats(tx, page.tenantId, shift(period, -3), tz, page.locale),
        await monthStats(tx, page.tenantId, shift(period, -2), tz, page.locale),
      ],
      details: await monthDetails(tx, page.tenantId, period, tz),
      goals: await getStatsGoals(tx, page.tenantId),
      sales: insights && tab === "ca" ? await monthSales(tx, page.tenantId, period, tz, page.locale) : null,
      occupancy: insights && tab === "rdv" ? await monthOccupancy(tx, page.tenantId, period, tz) : null,
      dayLookup: lookupDay
        ? ((await monthDetails(tx, page.tenantId, lookupDay.slice(0, 7), tz)).days[
            Number(lookupDay.slice(8)) - 1
          ] ?? null)
        : null,
      monthLookup: lookupMonth ? await monthStats(tx, page.tenantId, lookupMonth, tz, page.locale) : null,
    }),
  );
  const label = new Intl.DateTimeFormat(page.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}-15T12:00:00Z`));
  const share = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
  const previousBasket =
    previous.appointments - previous.noShows > 0
      ? Math.round(previous.revenueCents / (previous.appointments - previous.noShows))
      : 0;
  const onlineRate = share(stats.online, stats.online + stats.manual);
  const vs = t("vsPrevious");
  const money = (cents: number) => page.fmt.money(cents);
  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(page.locale, { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, index, 15)),
    ),
  );
  // Années proposées : les dix dernières.
  const lookupYears = Array.from({ length: 10 }, (_, index) => String(Number(current.slice(0, 4)) - index));
  const lookupDayLabel = lookupDay
    ? new Intl.DateTimeFormat(page.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${lookupDay}T12:00:00Z`))
    : "";
  const lookupMonthLabel = lookupMonth
    ? new Intl.DateTimeFormat(page.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${lookupMonth}-15T12:00:00Z`),
      )
    : "";
  const shortMoney = (cents: number) =>
    new Intl.NumberFormat(page.locale, {
      style: "currency",
      currency: page.tenant.currency,
      maximumFractionDigits: 0,
      notation: cents >= 1_000_000 ? "compact" : "standard",
    }).format(cents / 100);
  const weekdayName = new Intl.DateTimeFormat(page.locale, { weekday: "short", timeZone: "UTC" });
  const busiest = Math.max(...details.weekdays);
  const servicesTotal = stats.topServices.reduce((sum, [, count]) => sum + count, 0);
  const othersCount = stats.appointments - servicesTotal;
  const goalRings = [
    goals.revenueCents && {
      key: "revenue",
      label: t("goals.revenueShort"),
      value: stats.revenueCents,
      goal: goals.revenueCents,
      color: REVENUE,
      valueText: shortMoney(stats.revenueCents),
      goalText: shortMoney(goals.revenueCents),
      remaining: shortMoney(Math.max(goals.revenueCents - stats.revenueCents, 0)),
    },
    goals.appointments && {
      key: "appointments",
      label: t("goals.appointments"),
      value: stats.appointments,
      goal: goals.appointments,
      color: ONLINE,
      valueText: String(stats.appointments),
      goalText: String(goals.appointments),
      remaining: String(Math.max(goals.appointments - stats.appointments, 0)),
    },
    goals.newCustomers && {
      key: "newCustomers",
      label: t("goals.newCustomers"),
      value: stats.newCustomers,
      goal: goals.newCustomers,
      color: "#8a7be0",
      valueText: String(stats.newCustomers),
      goalText: String(goals.newCustomers),
      remaining: String(Math.max(goals.newCustomers - stats.newCustomers, 0)),
    },
  ].filter((item): item is Exclude<typeof item, null | 0 | undefined> => Boolean(item));
  // Les 3 mois précédents, du plus ancien au plus récent, comparés à l'objectif actuel.
  const monthShort = new Intl.DateTimeFormat(page.locale, { month: "long", timeZone: "UTC" });
  const pastMonths = [
    { period: shift(period, -3), stats: older[2] },
    { period: shift(period, -2), stats: older[3] },
    { period: shift(period, -1), stats: previous },
  ].map((item) => ({
    ...item,
    label: monthShort.format(new Date(`${item.period}-15T12:00:00Z`)),
  }));
  // Les 6 derniers mois (le mois affiché en dernier) : chiffre d'affaires de chacun.
  const monthAbbr = new Intl.DateTimeFormat(page.locale, { month: "short", timeZone: "UTC" });
  const sixMonths = [...older, previous, stats].map((month, index) => ({
    label: monthAbbr.format(new Date(`${shift(period, index - 5)}-15T12:00:00Z`)).replace(".", ""),
    revenueCents: month.revenueCents,
  }));
  const sixMonthsAverage = Math.round(sixMonths.reduce((sum, month) => sum + month.revenueCents, 0) / 6);
  const pastValue = (key: string, month: (typeof pastMonths)[number]["stats"]) =>
    key === "revenue" ? month.revenueCents : key === "appointments" ? month.appointments : month.newCustomers;
  const percent = (rate: number | null) =>
    rate === null
      ? null
      : rate > 0 && Math.round(rate * 100) === 0
        ? t("occupancy.lessThanOne")
        : `${Math.round(rate * 100)} %`;
  const hours = (minutes: number) => t("occupancy.hours", { hours: Math.round(minutes / 60) });
  const th = "pb-2 font-medium text-ink-soft";
  const td = "border-t border-hairline py-2.5";
  const num = "pl-3 text-right tabular-nums whitespace-nowrap";
  const salesTable = (
    id: string,
    breakdown: SalesBreakdown,
    labels: {
      title: string;
      intro: string;
      item: string;
      quantity: string;
      basis: string;
      empty: string;
      costsHref: string;
      after?: string;
    },
  ) => (
    <section aria-labelledby={id} className={`${panel} min-w-0`}>
      <h2 id={id} className="font-display text-[1.1rem] font-semibold text-night">
        {labels.title}
      </h2>
      <p className="text-sm text-ink-soft">{labels.intro}</p>
      {breakdown.lines.length === 0 ? (
        <p className="mt-4 text-ink-soft">{t("none")}</p>
      ) : (
        <>
          {/* Téléphone : une fiche par ligne, sans tableau à faire défiler. */}
          <ul className="mt-4 divide-y divide-hairline sm:hidden">
            {breakdown.lines.map((line) => (
              <li key={line.key} className="py-2.5">
                <p className="text-night">{line.name}</p>
                <p className="mt-0.5 text-sm text-ink-soft tabular-nums">
                  {labels.quantity} : {line.quantity} · {t("sales.revenue")} : {money(line.revenueCents)} ·{" "}
                  {t("sales.margin")} : {line.marginCents === null ? "—" : money(line.marginCents)}
                </p>
              </li>
            ))}
            <li className="py-2.5 font-semibold text-night">
              <p>{t("sales.total")}</p>
              <p className="mt-0.5 text-sm tabular-nums">
                {labels.quantity} : {breakdown.lines.reduce((sum, line) => sum + line.quantity, 0)} ·{" "}
                {t("sales.revenue")} : {money(breakdown.revenueCents)}
                {breakdown.withCost > 0 && (
                  <>
                    {" "}
                    · {t("sales.margin")} : {money(breakdown.marginCents)}
                  </>
                )}
              </p>
            </li>
          </ul>
          <div
            className="mt-4 hidden overflow-x-auto sm:block"
            role="region"
            aria-labelledby={id}
            tabIndex={0}
          >
            <table className="w-full text-left text-[0.9375rem]">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    {labels.item}
                  </th>
                  <th scope="col" className={`${th} ${num}`}>
                    {labels.quantity}
                  </th>
                  <th scope="col" className={`${th} ${num}`}>
                    {t("sales.revenue")}
                  </th>
                  <th scope="col" className={`${th} ${num}`}>
                    {t("sales.margin")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {breakdown.lines.map((line) => (
                  <tr key={line.key}>
                    <th scope="row" className={`${td} font-normal text-night`}>
                      {line.name}
                    </th>
                    <td className={`${td} ${num}`}>{line.quantity}</td>
                    <td className={`${td} ${num}`}>{money(line.revenueCents)}</td>
                    <td className={`${td} ${num}`}>
                      {line.marginCents === null ? (
                        <span className="text-ink-soft">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">{t("sales.noCost")}</span>
                        </span>
                      ) : (
                        money(line.marginCents)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-night">
                  <th scope="row" className={`${td} text-left`}>
                    {t("sales.total")}
                  </th>
                  <td className={`${td} ${num}`}>
                    {breakdown.lines.reduce((sum, line) => sum + line.quantity, 0)}
                  </td>
                  <td className={`${td} ${num}`}>{money(breakdown.revenueCents)}</td>
                  <td className={`${td} ${num}`}>
                    {breakdown.withCost > 0 ? money(breakdown.marginCents) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            {breakdown.withCost > 0 ? (
              <>
                <span className="font-medium text-night">
                  {t("sales.marginTotal", { amount: money(breakdown.marginCents) })}
                </span>{" "}
                ({labels.basis}). {t("sales.marginHint")}
              </>
            ) : (
              labels.empty
            )}
            {breakdown.withCost < breakdown.lines.length && (
              <>
                {" "}
                <Link href={labels.costsHref} className="font-medium text-accent hover:underline">
                  {t("sales.setCosts")}
                </Link>
              </>
            )}
          </p>
          {labels.after && <p className="mt-2 text-sm text-ink-soft">{labels.after}</p>}
        </>
      )}
      {breakdown.lines.length === 0 && labels.after && (
        <p className="mt-2 text-sm text-ink-soft">{labels.after}</p>
      )}
    </section>
  );
  const navButton =
    "flex size-10 items-center justify-center rounded-lg text-night transition hover:bg-accent-soft hover:text-accent";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {t("title")}
          </h1>
          <p className="mt-1 text-ink-soft">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-hairline bg-white p-1">
          <Link href={statsLink(shift(period, -1))} aria-label={t("previous")} className={navButton}>
            <DashIcon d="M15 6l-6 6 6 6" className="h-5 w-5" />
          </Link>
          <span className="min-w-36 px-2 text-center font-medium text-night first-letter:uppercase">
            {label}
          </span>
          {period < current ? (
            <Link href={statsLink(shift(period, 1))} aria-label={t("next")} className={navButton}>
              <DashIcon d="M9 6l6 6-6 6" className="h-5 w-5" />
            </Link>
          ) : (
            <span className="size-10" />
          )}
        </div>
      </div>

      {/* Chiffres clés et évolution par rapport au mois précédent. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          icon={DASH_ICONS.euro}
          tone="green"
          label={t("revenue")}
          value={money(stats.revenueCents)}
          trend={<Trend value={trendPercent(stats.revenueCents, previous.revenueCents)} label={vs} />}
          sub={
            <>
              {stats.upcomingRevenueCents > 0 && (
                <span className="block">
                  {t("revenueUpcoming", { amount: money(stats.upcomingRevenueCents) })}
                </span>
              )}
              {stats.shopRevenueCents > 0 && (
                <span className="block">{t("revenueShop", { amount: money(stats.shopRevenueCents) })}</span>
              )}
              <span className="block">{t("revenueNote")}</span>
            </>
          }
        />
        <StatCard
          icon={DASH_ICONS.calendar}
          tone="indigo"
          label={t("appointments")}
          value={String(stats.appointments)}
          trend={<Trend value={trendPercent(stats.appointments, previous.appointments)} label={vs} />}
          sub={`${t("cancelled")} : ${stats.cancelled}`}
        />
        <StatCard
          icon={DASH_ICONS.star}
          tone="amber"
          label={t("averageBasket")}
          value={money(details.averageBasketCents)}
          trend={<Trend value={trendPercent(details.averageBasketCents, previousBasket)} label={vs} />}
        />
        <StatCard
          icon={DASH_ICONS.users}
          tone="violet"
          label={t("newCustomers")}
          value={String(stats.newCustomers)}
          trend={<Trend value={trendPercent(stats.newCustomers, previous.newCustomers)} label={vs} />}
        />
        <StatCard
          icon={DASH_ICONS.globe}
          tone="teal"
          label={t("onlineRate")}
          value={`${onlineRate} %`}
          sub={`${stats.online} / ${stats.online + stats.manual}`}
        />
        <StatCard
          icon={DASH_ICONS.clock}
          tone="indigo"
          label={t("noShowRate")}
          value={`${Math.round(stats.noShowRate * 100)} %`}
          sub={`${t("noShows")} : ${stats.noShows}`}
        />
      </div>

      {/* Consulter le chiffre d'affaires d'un jour ou d'un mois précis. */}
      <section aria-labelledby="consulter-ca" className={panel}>
        <h2 id="consulter-ca" className="font-display text-[1.2rem] font-semibold text-night">
          {t("lookup.title")}
        </h2>
        <p className="text-sm text-ink-soft">{t("lookup.intro")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form method="get" className="rounded-2xl border border-hairline p-4">
            <input type="hidden" name="mois" value={period} />
            {tab === "rdv" && <input type="hidden" name="vue" value="rdv" />}
            <label htmlFor="ca-jour-choix" className={ui.label}>
              {t("lookup.dayLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="ca-jour-choix"
                type="date"
                name="jour"
                max={today}
                defaultValue={lookupDay ?? today}
                required
                className={`${ui.input} min-w-0 flex-1`}
              />
              <button type="submit" className={`${ui.primaryButton} w-auto shrink-0 px-5`}>
                {t("lookup.show")}
              </button>
            </div>
            {lookupDay && (
              <div className="mt-4 rounded-xl bg-accent-soft px-4 py-3" role="status">
                <p className="text-sm text-ink-soft first-letter:uppercase">
                  {t("lookup.dayResult", { date: lookupDayLabel })}
                </p>
                <p className="font-display text-[1.75rem] font-semibold leading-tight text-night tabular-nums">
                  {money(dayLookup?.revenueCents ?? 0)}
                </p>
                <p className="text-sm text-ink-soft">
                  {t("lookup.appointments", { count: (dayLookup?.online ?? 0) + (dayLookup?.manual ?? 0) })}
                </p>
              </div>
            )}
          </form>
          <form method="get" className="rounded-2xl border border-hairline p-4">
            <input type="hidden" name="mois" value={period} />
            {tab === "rdv" && <input type="hidden" name="vue" value="rdv" />}
            <p className={ui.label}>{t("lookup.monthLabel")}</p>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor="ca-mois-m">
                {t("lookup.month")}
              </label>
              <select
                id="ca-mois-m"
                name="caMoisM"
                defaultValue={(lookupMonth ?? current).slice(5)}
                className={`${ui.input} min-w-0 flex-1`}
              >
                {monthNames.map((name, index) => (
                  <option key={name} value={String(index + 1).padStart(2, "0")}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="ca-mois-a">
                {t("lookup.year")}
              </label>
              <select
                id="ca-mois-a"
                name="caMoisA"
                defaultValue={(lookupMonth ?? current).slice(0, 4)}
                className={`${ui.input} w-28 shrink-0`}
              >
                {lookupYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button type="submit" className={`${ui.primaryButton} w-auto shrink-0 px-5`}>
                {t("lookup.show")}
              </button>
            </div>
            {lookupMonth && (
              <div className="mt-4 rounded-xl bg-accent-soft px-4 py-3" role="status">
                <p className="text-sm text-ink-soft">
                  {t("lookup.monthResult", { month: lookupMonthLabel })}
                </p>
                <p className="font-display text-[1.75rem] font-semibold leading-tight text-night tabular-nums">
                  {money(monthLookup?.revenueCents ?? 0)}
                </p>
                <p className="text-sm text-ink-soft">
                  {t("lookup.appointments", { count: monthLookup?.appointments ?? 0 })}
                  {" · "}
                  <Link href={statsLink(lookupMonth)} className="font-medium text-accent underline">
                    {t("lookup.monthStats")}
                  </Link>
                </p>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* Onglets : une seule partie des statistiques à la fois. */}
      {detailed && (
        <nav aria-label={t("tabsLabel")} className="flex rounded-xl bg-[#eceff5] p-1">
          {(["ca", "rdv"] as const).map((value) => (
            <Link
              key={value}
              href={statsLink(period, value)}
              aria-current={tab === value ? "page" : undefined}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-[0.9375rem] font-medium text-ink-soft transition hover:text-night aria-[current=page]:bg-white aria-[current=page]:text-night aria-[current=page]:shadow-[0_1px_3px_rgba(15,24,48,.12)]"
            >
              {t(`tabs.${value}`)}
            </Link>
          ))}
        </nav>
      )}

      {!detailed ? (
        <section className={`${panel} bg-gradient-to-br from-white to-accent-soft/60`}>
          <h2 className="font-display text-[1.2rem] font-semibold text-night">{t("upgradeTitle")}</h2>
          <p className="mt-2 text-ink-soft">{t("upgradeText")}</p>
          <p className="mt-3 text-[0.9375rem] text-night">
            {t("detailed", {
              plan: (await page.db((tx) => firstPlanWith(tx, "stats", page.locale))) ?? "none",
            })}
          </p>
        </section>
      ) : (
        <>
          {/* Objectifs du mois. */}
          {tab === "ca" && (
            <section aria-labelledby="objectifs" className={panel}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="objectifs" className="font-display text-[1.2rem] font-semibold text-night">
                    {t("goals.title")}
                  </h2>
                  <p className="text-sm text-ink-soft">{t("goals.intro")}</p>
                </div>
              </div>
              {goalRings.length > 0 ? (
                <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-6">
                  {goalRings.map((ring) => (
                    <GoalRing
                      key={ring.key}
                      label={ring.label}
                      value={ring.value}
                      goal={ring.goal}
                      color={ring.color}
                      valueText={ring.valueText}
                      goalText={ring.goalText}
                      remainingText={
                        ring.value >= ring.goal
                          ? t("goals.reached")
                          : t("goals.remaining", { value: ring.remaining })
                      }
                    />
                  ))}
                </div>
              ) : null}
              {goalRings.length > 0 && (
                <div className="mt-6 border-t border-hairline pt-5">
                  <h3 className="font-medium text-night">{t("goals.previousTitle")}</h3>
                  <p className="text-sm text-ink-soft">{t("goals.previousHint")}</p>
                  <div className="mt-4 space-y-5">
                    {goalRings.map((ring) => (
                      <div key={ring.key}>
                        {goalRings.length > 1 && (
                          <p className="mb-2 text-sm font-medium text-ink-soft">{ring.label}</p>
                        )}
                        <div className="grid grid-cols-3 gap-3 sm:gap-6">
                          {pastMonths.map((month) => {
                            const value = pastValue(ring.key, month.stats);
                            return (
                              <MiniGoalRing
                                key={month.period}
                                monthLabel={month.label}
                                value={value}
                                goal={ring.goal}
                                color={ring.color}
                                valueText={ring.key === "revenue" ? shortMoney(value) : String(value)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <details
                className={`group ${goalRings.length > 0 ? "mt-5 border-t border-hairline pt-4" : "mt-1"}`}
              >
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium text-accent [&::-webkit-details-marker]:hidden">
                  {goalRings.length > 0 ? t("goals.edit") : t("goals.set")}
                  <DashIcon d="M6 9l6 6 6-6" className="h-4 w-4 transition group-open:rotate-180" />
                </summary>
                <ActionForm
                  action={updateStatsGoalsAction}
                  submitLabel={tCommon("save")}
                  className="mt-4 space-y-4"
                >
                  <Hidden values={{ tenantId: page.tenantId }} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <TextField
                      name="revenue"
                      inputMode="decimal"
                      label={t("goals.revenue", { currency: page.fmt.currency })}
                      defaultValue={goals.revenueCents ? centsToInput(goals.revenueCents) : ""}
                    />
                    <TextField
                      name="appointments"
                      inputMode="numeric"
                      label={t("goals.appointments")}
                      defaultValue={goals.appointments ?? ""}
                    />
                    <TextField
                      name="newCustomers"
                      inputMode="numeric"
                      label={t("goals.newCustomers")}
                      defaultValue={goals.newCustomers ?? ""}
                    />
                  </div>
                  <p className="text-sm text-ink-soft">{t("goals.hint")}</p>
                </ActionForm>
              </details>
            </section>
          )}

          {/* Courbes jour par jour. */}
          <div className="grid gap-6">
            {tab === "rdv" && (
              <section aria-labelledby="par-jour" className={`${panel} min-w-0`}>
                <h2 id="par-jour" className="font-display text-[1.1rem] font-semibold text-night">
                  {t("dailyTitle")}
                </h2>
                <LineChart
                  id="rdv"
                  summary={t("dailySummary")}
                  labels={details.days.map((day) => String(Number(day.date.slice(8))))}
                  series={[
                    { label: t("online"), color: ONLINE, values: details.days.map((day) => day.online) },
                    { label: t("salon"), color: SALON, values: details.days.map((day) => day.manual) },
                  ]}
                />
              </section>
            )}
            {tab === "ca" && (
              <section aria-labelledby="ca-6-mois" className={`${panel} min-w-0`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="ca-6-mois" className="font-display text-[1.1rem] font-semibold text-night">
                    {t("sixMonthsTitle")}
                  </h2>
                  <p className="text-sm text-ink-soft">
                    {t("sixMonthsAverage", { value: shortMoney(sixMonthsAverage) })}
                  </p>
                </div>
                <BarChart
                  summary={t("sixMonthsSummary")}
                  labels={sixMonths.map((month) => month.label)}
                  values={sixMonths.map((month) => month.revenueCents)}
                  format={(value) => shortMoney(value)}
                  color={REVENUE}
                  highlight={5}
                  valueLabels
                />
              </section>
            )}
            {tab === "ca" && (
              <section aria-labelledby="ca-jour" className={`${panel} min-w-0`}>
                <h2 id="ca-jour" className="font-display text-[1.1rem] font-semibold text-night">
                  {t("revenueTitle")}
                </h2>
                <BarChart
                  summary={t("revenueSummary")}
                  labels={details.days.map((day) => String(Number(day.date.slice(8))))}
                  format={(value) => shortMoney(value)}
                  color={REVENUE}
                  values={details.days.map((day) => day.revenueCents)}
                />
              </section>
            )}
          </div>

          {/* Répartitions. */}
          {tab === "rdv" && (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <section aria-labelledby="prestations" className={`${panel} min-w-0`}>
                <h2 id="prestations" className="font-display text-[1.05rem] font-semibold text-night">
                  {t("servicesTitle")}
                </h2>
                {servicesTotal === 0 ? (
                  <p className="mt-4 text-ink-soft">{t("none")}</p>
                ) : (
                  <Donut
                    items={[
                      ...stats.topServices.map(([name, value]) => ({ label: name, value })),
                      ...(othersCount > 0 ? [{ label: t("others"), value: othersCount }] : []),
                    ]}
                    total={servicesTotal + Math.max(othersCount, 0)}
                    centerLabel={t("servicesUnit", { count: servicesTotal })}
                  />
                )}
              </section>
              <section aria-labelledby="equipe" className={`${panel} min-w-0`}>
                <h2 id="equipe" className="font-display text-[1.05rem] font-semibold text-night">
                  {t("teamTitle")}
                </h2>
                {details.staff.length === 0 ? (
                  <p className="mt-4 text-ink-soft">{t("none")}</p>
                ) : (
                  <Donut
                    items={details.staff.map((member) => ({
                      label: `${member.name} · ${shortMoney(member.revenueCents)}`,
                      value: member.count,
                      color: member.color,
                    }))}
                    total={details.staff.reduce((sum, member) => sum + member.count, 0)}
                    centerLabel={t("teamUnit", { count: stats.appointments })}
                  />
                )}
              </section>
              <div className="min-w-0 space-y-6 md:col-span-2 xl:col-span-1">
                <section aria-labelledby="canal" className={`${panel} min-w-0`}>
                  <h2 id="canal" className="font-display text-[1.05rem] font-semibold text-night">
                    {t("channelTitle")}
                  </h2>
                  <SplitBar
                    left={{ label: t("online"), value: stats.online }}
                    right={{ label: t("salon"), value: stats.manual }}
                  />
                </section>
                <section aria-labelledby="clientes-mois" className={`${panel} min-w-0`}>
                  <h2 id="clientes-mois" className="font-display text-[1.05rem] font-semibold text-night">
                    {t("loyaltyTitle")}
                  </h2>
                  <SplitBar
                    left={{ label: t("returning"), value: details.returningCustomers }}
                    right={{ label: t("firstTime"), value: details.customers - details.returningCustomers }}
                  />
                </section>
              </div>
            </div>
          )}

          {/* Jours et heures les plus chargés. */}
          {tab === "rdv" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section aria-labelledby="jours" className={`${panel} min-w-0`}>
                <h2 id="jours" className="font-display text-[1.1rem] font-semibold text-night">
                  {t("weekdaysTitle")}
                </h2>
                <RevenueBars
                  showValues
                  days={details.weekdays.map((count, index) => ({
                    label: weekdayName
                      .format(new Date(`${addDays(MONDAY, index)}T12:00:00Z`))
                      .replace(".", ""),
                    value: String(count),
                    cents: count,
                    today: count > 0 && count === busiest,
                  }))}
                />
              </section>
              <section aria-labelledby="heures" className={`${panel} min-w-0`}>
                <h2 id="heures" className="font-display text-[1.1rem] font-semibold text-night">
                  {t("hoursTitle")}
                </h2>
                <HourHeat
                  hours={details.hours}
                  from={8}
                  to={20}
                  label={(hour, count) => t("hourLabel", { hour, count })}
                />
              </section>
            </div>
          )}

          {/* Sans la fonction « remplissage et rentabilité » : une ligne pour la faire connaître. */}
          {tab === "ca" && !insights && (
            <section className={`${panel} bg-gradient-to-br from-white to-accent-soft/60`}>
              <h2 className="font-display text-[1.2rem] font-semibold text-night">{t("insightsTitle")}</h2>
              <p className="mt-2 text-ink-soft">
                {t("insightsUpgrade", {
                  plan:
                    (await page.db((tx) => firstPlanWith(tx, "performanceInsights", page.locale))) ?? "none",
                })}
              </p>
            </section>
          )}

          {/* Taux de remplissage : temps réservé / temps de travail prévu. */}
          {tab === "rdv" && occupancy && (
            <section aria-labelledby="remplissage" className={`${panel} min-w-0`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl">
                  <h2 id="remplissage" className="font-display text-[1.1rem] font-semibold text-night">
                    {t("occupancy.title")}
                  </h2>
                  <p className="text-sm text-ink-soft">{t("occupancy.intro")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-ink-soft">{t("occupancy.team")}</p>
                  <p className="font-display text-[1.75rem] font-semibold text-night tabular-nums">
                    {percent(occupancy.rate) ?? "—"}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {occupancy.rate === null
                      ? t("occupancy.noHours")
                      : t("occupancy.summary", {
                          booked: hours(occupancy.bookedMinutes),
                          available: hours(occupancy.availableMinutes),
                        })}
                  </p>
                </div>
              </div>
              {occupancy.staff.length === 0 ? (
                <p className="mt-4 text-ink-soft">{t("none")}</p>
              ) : (
                <div
                  className="mt-4 overflow-x-auto"
                  role="region"
                  aria-labelledby="remplissage"
                  tabIndex={0}
                >
                  <table className="w-full text-left text-[0.9375rem]">
                    <thead>
                      <tr>
                        <th scope="col" className={th}>
                          {t("occupancy.member")}
                        </th>
                        <th scope="col" className={`${th} ${num}`}>
                          {t("occupancy.booked")}
                        </th>
                        <th scope="col" className={`${th} ${num}`}>
                          {t("occupancy.available")}
                        </th>
                        <th scope="col" className={`${th} ${num}`}>
                          {t("occupancy.rate")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {occupancy.staff.map((member) => (
                        <tr key={member.id}>
                          <th scope="row" className={`${td} font-normal text-night`}>
                            <span className="inline-flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="size-2.5 shrink-0 rounded-full bg-accent"
                                style={member.color ? { backgroundColor: member.color } : undefined}
                              />
                              {member.name}
                            </span>
                          </th>
                          <td className={`${td} ${num}`}>{hours(member.bookedMinutes)}</td>
                          <td className={`${td} ${num}`}>{hours(member.availableMinutes)}</td>
                          <td className={`${td} ${num} font-semibold text-night`}>
                            {percent(member.rate) ?? (
                              <span className="text-sm font-normal text-ink-soft">
                                {t("occupancy.noHours")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Chiffre d'affaires et marge par prestation, puis par produit si la boutique a vendu. */}
          {tab === "ca" && (
            <>
              {sales && (
                <div className={`grid gap-6 ${sales.products.lines.length > 0 ? "xl:grid-cols-2" : ""}`}>
                  {salesTable("ca-prestations", sales.services, {
                    title: t("sales.servicesTitle"),
                    intro: t("sales.servicesIntro"),
                    item: t("sales.service"),
                    quantity: t("sales.count"),
                    basis: t("sales.marginBasisServices", {
                      counted: sales.services.withCost,
                      total: sales.services.lines.length,
                    }),
                    empty: t("sales.marginEmptyServices"),
                    costsHref: `${page.base}/site/prestations`,
                    after:
                      sales.upcomingServices.count > 0
                        ? t("sales.upcoming", {
                            count: sales.upcomingServices.count,
                            amount: money(sales.upcomingServices.revenueCents),
                          })
                        : undefined,
                  })}
                  {sales.products.lines.length > 0 &&
                    salesTable("ca-produits", sales.products, {
                      title: t("sales.productsTitle"),
                      intro: t("sales.productsIntro"),
                      item: t("sales.product"),
                      quantity: t("sales.quantity"),
                      basis: t("sales.marginBasisProducts", {
                        counted: sales.products.withCost,
                        total: sales.products.lines.length,
                      }),
                      empty: t("sales.marginEmptyProducts"),
                      costsHref: `${page.base}/plus/boutique`,
                    })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
