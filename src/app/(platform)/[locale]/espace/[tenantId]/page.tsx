import { getTranslations } from "next-intl/server";
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
import { DayTimeline } from "@/components/manager/DayTimeline";
import { InstallAppCard } from "@/components/manager/InstallAppCard";
import { PushReminder } from "@/components/manager/PushReminder";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { dayRange, todaySummary, upcomingAppointments } from "@/modules/agenda/queries";
import { smsUsage } from "@/modules/messages/sms-usage";
import { reviewsCacheByBusiness } from "@/modules/reviews/google";
import { getPlatformSetting } from "@/modules/settings";
import { dashboardStats, trendPercent } from "@/modules/stats/dashboard";
import { monthStats } from "@/modules/stats/month";

/**
 * Accueil de l'espace gérante (tableau de bord) : salutation et actions, chiffres
 * clés, agenda du jour (ou prochains rendez-vous), chiffre d'affaires des 7 derniers
 * jours, répartition des prestations et part des réservations en ligne du mois.
 */
export default async function TodayPage({ params }: PageProps<"/[locale]/espace/[tenantId]">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.today");
  const now = new Date();
  const tz = page.tenant.timezone;
  const [summary, sms, warningPercent, stats, reviews] = await page.db(
    async (tx) =>
      [
        await todaySummary(tx, page.tenantId, tz, page.locale, now),
        await smsUsage(tx, page.tenantId),
        await getPlatformSetting(tx, "sms_warning_percent"),
        await dashboardStats(tx, page.tenantId, tz, now),
        (await reviewsCacheByBusiness(tx, page.tenantId)).get(page.businessId),
      ] as const,
  );
  const month = await page.db((tx) =>
    monthStats(tx, page.tenantId, stats.today.slice(0, 7), tz, page.locale),
  );
  // Journée vide : on montre les prochains rendez-vous plutôt qu'un écran vide.
  const upcoming =
    summary.appointments.length === 0
      ? await page.db((tx) =>
          upcomingAppointments(tx, page.tenantId, { timezone: page.tenant.timezone, locale: page.locale }),
        )
      : [];
  const shortDay = new Intl.DateTimeFormat(page.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  const weekday = new Intl.DateTimeFormat(page.locale, { weekday: "short", timeZone: tz });
  const firstName = page.session.user.name?.trim().split(/\s+/)[0] ?? "";
  const online = summary.appointments.filter((item) => item.source === "online").length;
  const monthTotal = month.online + month.manual;
  const servicesTotal = month.topServices.reduce((sum, [, count]) => sum + count, 0);
  const rating = reviews?.fetchedAt && reviews.rating !== null ? reviews : null;
  // Alerte SMS : à partir du seuil du quota du mois, sauf si des SMS achetés prennent le relais.
  const smsAlert =
    sms && sms.limit !== null && sms.limit > 0 && sms.packsRemaining === 0
      ? sms.used >= sms.limit
        ? t("smsReached")
        : sms.used >= Math.ceil((sms.limit * Number(warningPercent)) / 100)
          ? t("smsAlmost", { used: sms.used, limit: sms.limit })
          : null
      : null;

  return (
    <div className="space-y-6">
      {/* Salutation et actions principales. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night sm:text-[2rem]">
            {firstName ? t("hello", { name: firstName }) : t("helloNoName")}
          </h1>
          <p className="mt-1 text-ink-soft first-letter:uppercase">
            {t("subtitle", { date: page.fmt.day(now) })}
          </p>
        </div>
        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
          <Link
            href={`${page.base}/indisponibilites`}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-hairline bg-white px-4 text-[0.95rem] font-medium text-night transition hover:border-accent-line hover:text-accent"
          >
            {t("unavailable")}
          </Link>
          <Link
            href={`${page.base}/rendez-vous/nouveau`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[0.95rem] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_12px_26px_-16px_var(--color-accent)] transition hover:bg-accent-strong"
          >
            <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
            {t("add")}
          </Link>
        </div>
      </div>

      {smsAlert && (
        <p role="status" className={`${panel} !py-4 border-[#f3d3cc] bg-[#fdf4f2] text-night`}>
          {smsAlert}{" "}
          <Link href={`${page.base}/plus/abonnement#sms`} className="font-medium text-accent underline">
            {t("smsOpen")}
          </Link>
        </p>
      )}

      {/* Rappel tant que les notifications ne sont pas activées sur cet appareil (gérante seulement). */}
      {page.role !== "admin" && (
        <InstallAppCard
          iconUrl="/api/app/icon/192"
          labels={{
            title: t("install.title"),
            text: t("install.text"),
            install: t("install.install"),
            later: t("install.later"),
            iosHowTo: t("install.iosHowTo"),
          }}
        />
      )}
      {page.role !== "admin" && (
        <PushReminder
          href={`${page.base}/notifications`}
          labels={{
            title: t("pushReminder.title"),
            text: t("pushReminder.text"),
            action: t("pushReminder.action"),
            later: t("pushReminder.later"),
          }}
        />
      )}

      {/* Chiffres clés. */}
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${rating ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        <StatCard
          icon={DASH_ICONS.calendar}
          tone="indigo"
          label={t("appointments")}
          value={String(summary.count)}
          sub={t("newBookings", { count: summary.newBookings })}
        />
        <StatCard
          icon={DASH_ICONS.euro}
          tone="green"
          label={t("revenue")}
          value={page.fmt.money(summary.revenueCents)}
          sub={t("todayOnline", { count: online })}
        />
        <StatCard
          icon={DASH_ICONS.users}
          tone="violet"
          label={t("newCustomers")}
          value={String(stats.newCustomers)}
          sub={t("last7")}
          trend={
            <Trend
              value={trendPercent(stats.newCustomers, stats.previousNewCustomers)}
              label={t("trendLabel")}
            />
          }
        />
        <StatCard
          icon={DASH_ICONS.globe}
          tone="teal"
          label={t("onlineRate")}
          value={`${monthTotal ? Math.round((month.online / monthTotal) * 100) : 0} %`}
          sub={t("onlineRateSub", { online: month.online, total: monthTotal })}
        />
        {rating && (
          <StatCard
            icon={DASH_ICONS.star}
            tone="amber"
            label={t("reviews")}
            value={(rating.rating ?? 0).toLocaleString(page.locale, { maximumFractionDigits: 1 })}
            sub={t("reviewsCount", { count: rating.total })}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agenda du jour. */}
        <section aria-labelledby="rdv-du-jour" className={`${panel} min-w-0 lg:col-span-2`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="rdv-du-jour"
              className="flex items-center gap-3 font-display text-[1.2rem] font-semibold text-night"
            >
              {t("title")}
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-sans text-[0.78rem] font-medium text-accent-strong">
                {t("count", { count: summary.count })}
              </span>
            </h2>
            <Link
              href={`${page.base}/agenda`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-[0.88rem] font-medium text-accent hover:bg-accent-soft"
            >
              {t("openAgenda")}
              <DashIcon d={DASH_ICONS.arrow} className="h-4 w-4" />
            </Link>
          </div>
          {summary.appointments.length === 0 ? (
            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-2xl bg-mist-50 p-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white text-accent">
                  <DashIcon d={DASH_ICONS.clock} className="h-[22px] w-[22px]" />
                </span>
                <p className="text-ink-soft">{t("empty")}</p>
              </div>
              {upcoming.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[0.8rem] font-medium uppercase tracking-[0.08em] text-ink-soft">
                    {t("upcoming")}
                  </h3>
                  <DayTimeline
                    items={upcoming}
                    base={page.base}
                    time={page.fmt.time}
                    now={now}
                    day={(date) => shortDay.format(date)}
                  />
                </div>
              )}
            </div>
          ) : (
            <DayTimeline
              items={summary.appointments}
              base={page.base}
              time={page.fmt.time}
              nextId={summary.nextId}
              now={now}
            />
          )}
        </section>

        <div className="min-w-0 space-y-6">
          {/* Chiffre d'affaires des 7 derniers jours. */}
          <section aria-labelledby="ca-semaine" className={panel}>
            <h2 id="ca-semaine" className="font-display text-[1.1rem] font-semibold text-night">
              {t("revenueTitle")}
            </h2>
            <p className="text-[0.8rem] text-ink-soft">{t("last7")}</p>
            <p className="mt-3 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-[1.9rem] font-semibold leading-none tracking-[-0.02em] text-night tabular-nums">
                {page.fmt.money(stats.weekCents)}
              </span>
              <Trend value={trendPercent(stats.weekCents, stats.previousWeekCents)} label={t("trendLabel")} />
            </p>
            <RevenueBars
              days={stats.revenue.map((day) => {
                const instant = dayRange(day.date, tz).start;
                return {
                  label: weekday.format(instant).replace(".", ""),
                  value: page.fmt.money(day.cents),
                  cents: day.cents,
                  today: day.date === stats.today,
                };
              })}
            />
          </section>

          {/* Répartition des prestations du mois. */}
          <section aria-labelledby="prestations-mois" className={panel}>
            <h2 id="prestations-mois" className="font-display text-[1.1rem] font-semibold text-night">
              {t("servicesTitle")}
            </h2>
            <p className="text-[0.8rem] text-ink-soft">{t("thisMonth")}</p>
            {servicesTotal === 0 ? (
              <p className="mt-4 text-[0.9rem] text-ink-soft">{t("noData")}</p>
            ) : (
              <Donut
                items={month.topServices.map(([label, value]) => ({ label, value }))}
                total={servicesTotal}
                centerLabel={t("servicesUnit", { count: servicesTotal })}
              />
            )}
          </section>

          {/* Réservations du mois : en ligne ou ajoutées au salon. */}
          <section aria-labelledby="canal-mois" className={panel}>
            <h2 id="canal-mois" className="font-display text-[1.1rem] font-semibold text-night">
              {t("channelTitle")}
            </h2>
            <p className="text-[0.8rem] text-ink-soft">{t("thisMonth")}</p>
            <SplitBar
              left={{ label: t("online"), value: month.online }}
              right={{ label: t("salon"), value: month.manual }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
