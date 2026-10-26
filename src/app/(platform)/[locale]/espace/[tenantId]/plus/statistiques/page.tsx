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
import { GoalRing, HourHeat, LineChart } from "@/components/manager/StatsCharts";
import { Link } from "@/i18n/navigation";
import { centsToInput } from "@/lib/format";
import { managerPage } from "@/lib/manager/page";
import { firstPlanWith } from "@/modules/billing/plans";
import { addDays, utcToLocal } from "@/modules/booking/time";
import { getStatsGoals } from "@/modules/stats/goals";
import { trendPercent } from "@/modules/stats/dashboard";
import { monthDetails, monthStats } from "@/modules/stats/month";
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
  const page = await managerPage(params);
  const t = await getTranslations("manager.stats");
  const tCommon = await getTranslations("common");
  const tz = page.tenant.timezone;
  const current = utcToLocal(new Date(), tz).date.slice(0, 7);
  const requested = (await searchParams).mois;
  const period =
    typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= current
      ? requested
      : current;
  const detailed = Boolean(page.tenant.features.stats);
  const { stats, previous, details, goals } = await page.db(async (tx) => ({
    stats: await monthStats(tx, page.tenantId, period, tz, page.locale),
    previous: await monthStats(tx, page.tenantId, shift(period, -1), tz, page.locale),
    details: await monthDetails(tx, page.tenantId, period, tz),
    goals: await getStatsGoals(tx, page.tenantId),
  }));
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
      label: t("goals.revenue").replace(/\s*\(.*\)$/, ""),
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
          <Link
            href={`${page.base}/plus/statistiques?mois=${shift(period, -1)}`}
            aria-label={t("previous")}
            className={navButton}
          >
            <DashIcon d="M15 6l-6 6 6 6" className="h-5 w-5" />
          </Link>
          <span className="min-w-36 px-2 text-center font-medium text-night first-letter:uppercase">
            {label}
          </span>
          {period < current ? (
            <Link
              href={`${page.base}/plus/statistiques?mois=${shift(period, 1)}`}
              aria-label={t("next")}
              className={navButton}
            >
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
            ) : (
              <p className="mt-4 rounded-2xl bg-mist-50 px-4 py-3 text-ink-soft">{t("goals.empty")}</p>
            )}
            <details className="group mt-5 border-t border-hairline pt-4">
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
                    label={t("goals.revenue")}
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

          {/* Courbes jour par jour. */}
          <div className="grid gap-6 xl:grid-cols-2">
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
            <section aria-labelledby="ca-jour" className={`${panel} min-w-0`}>
              <h2 id="ca-jour" className="font-display text-[1.1rem] font-semibold text-night">
                {t("revenueTitle")}
              </h2>
              <LineChart
                id="ca"
                summary={t("revenueSummary")}
                labels={details.days.map((day) => String(Number(day.date.slice(8))))}
                format={(value) => shortMoney(value)}
                series={[
                  {
                    label: t("revenue"),
                    color: REVENUE,
                    values: details.days.map((day) => day.revenueCents),
                  },
                ]}
              />
            </section>
          </div>

          {/* Répartitions. */}
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

          {/* Jours et heures les plus chargés. */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="jours" className={`${panel} min-w-0`}>
              <h2 id="jours" className="font-display text-[1.1rem] font-semibold text-night">
                {t("weekdaysTitle")}
              </h2>
              <RevenueBars
                days={details.weekdays.map((count, index) => ({
                  label: weekdayName.format(new Date(`${addDays(MONDAY, index)}T12:00:00Z`)).replace(".", ""),
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
        </>
      )}
    </div>
  );
}
