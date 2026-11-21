import { getTranslations } from "next-intl/server";
import { siteSetupView } from "@/modules/setup/site-setup";
import { DASH_ICONS, DashIcon, panel, StatCard, Trend } from "@/components/manager/DashboardWidgets";
import { DayTimeline } from "@/components/manager/DayTimeline";
import { InstallAppCard } from "@/components/manager/InstallAppCard";
import { PushReminder } from "@/components/manager/PushReminder";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { todaySummary, upcomingAppointments } from "@/modules/agenda/queries";
import { smsUsage } from "@/modules/messages/sms-usage";
import { getPlatformSetting } from "@/modules/settings";
import { dashboardStats, trendPercent } from "@/modules/stats/dashboard";
import { openShopOrdersCount } from "@/modules/shop/orders";
import { agendaStaffFilter, canAccess } from "@/modules/team/access";
import { capitalize } from "@/lib/text";

/**
 * Accueil de l'espace gérante : salutation et actions, rappels utiles, agenda du jour
 * (ou prochains rendez-vous) et trois chiffres clés. Les graphiques détaillés sont
 * sur la page Statistiques, pour que l'accueil reste centré sur la journée.
 */
export default async function TodayPage({ params }: PageProps<"/[locale]/espace/[tenantId]">) {
  const page = await managerPage(params, "agenda");
  const t = await getTranslations("manager.today");
  const now = new Date();
  const tz = page.tenant.timezone;
  // Collaborateur : ses rendez-vous seulement (si la gérante l'a choisi), chiffres s'ils lui sont ouverts.
  const staffId = agendaStaffFilter(page.space);
  const showStats = canAccess(page.space, "stats");
  const isOwner = canAccess(page.space, "owner");
  const [summary, sms, warningPercent, stats] = await page.db(
    async (tx) =>
      [
        await todaySummary(tx, page.tenantId, tz, page.locale, now, staffId),
        await smsUsage(tx, page.tenantId),
        await getPlatformSetting(tx, "sms_warning_percent"),
        await dashboardStats(tx, page.tenantId, tz, now),
      ] as const,
  );
  // Site créé pour la gérante, pas encore en ligne : où en est la mise en route.
  const setup = isOwner
    ? await page.db((tx) =>
        siteSetupView(tx, page.tenantId, {
          customDomain: Boolean(page.tenant.features.customDomain),
          status: page.tenant.status,
        }),
      )
    : null;
  const setupCurrent =
    setup && !setup.complete ? setup.steps.findIndex((step) => step.state === "current") : -1;
  const tSetup = await getTranslations("manager.setup");
  // Commandes de la boutique à traiter : rappel en haut de l'accueil.
  const openOrders =
    page.tenant.features.commerce && canAccess(page.space, "shop")
      ? await page.db((tx) => openShopOrdersCount(tx, page.tenantId))
      : 0;
  // Journée vide : on montre les prochains rendez-vous plutôt qu'un écran vide.
  const upcoming =
    summary.appointments.length === 0
      ? await page.db((tx) =>
          upcomingAppointments(tx, page.tenantId, {
            timezone: page.tenant.timezone,
            locale: page.locale,
            staffId,
          }),
        )
      : [];
  const shortDay = new Intl.DateTimeFormat(page.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  const firstName = page.session.user.name?.trim().split(/\s+/)[0] ?? "";
  const online = summary.appointments.filter((item) => item.source === "online").length;
  // Alerte SMS : à partir du seuil du quota du mois, sauf si des SMS achetés prennent le relais.
  const smsAlert =
    isOwner && sms && sms.limit !== null && sms.limit > 0 && sms.packsRemaining === 0
      ? sms.used >= sms.limit
        ? t("smsReached")
        : sms.used >= Math.ceil((sms.limit * Number(warningPercent)) / 100)
          ? t("smsAlmost", { used: sms.used, limit: sms.limit })
          : null
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Salutation et actions principales. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night sm:text-[2rem]">
            {firstName ? t("hello", { name: firstName }) : t("helloNoName")}
          </h1>
          <p className="mt-1 text-ink-soft">{capitalize(t("subtitle", { date: page.fmt.day(now) }))}</p>
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
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[0.95rem] font-medium text-white shadow-[0_1px_2px_rgba(15,24,48,.08)] transition hover:bg-accent-strong"
          >
            <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
            {t("add")}
          </Link>
        </div>
      </div>

      {setup && setupCurrent >= 0 && (
        <section
          aria-labelledby="mise-en-route"
          className={`${panel} !py-4 border-accent-line bg-accent-soft/60 text-night`}
        >
          <h2 id="mise-en-route" className="font-semibold">
            {tSetup("card.title")}
          </h2>
          <p className="mt-1 text-ink-soft">
            {tSetup("card.step", {
              current: setupCurrent + 1,
              total: setup.steps.length,
              label: tSetup(`steps.${setup.steps[setupCurrent].key}.title`),
            })}
          </p>
          <Link
            href={`${page.base}/mise-en-route`}
            className="mt-2 inline-flex min-h-11 items-center font-medium text-accent underline"
          >
            {tSetup("card.open")}
          </Link>
        </section>
      )}

      {openOrders > 0 && (
        <p role="status" className={`${panel} !py-4 border-accent-line bg-accent-soft/60 text-night`}>
          {t("ordersOpen", { count: openOrders })}{" "}
          <Link href={`${page.base}/plus/commandes`} className="font-medium text-accent underline">
            {t("ordersLink")}
          </Link>
        </p>
      )}

      {smsAlert && (
        <p role="status" className={`${panel} !py-4 border-warning-soft bg-warning-soft text-warning-ink`}>
          {smsAlert}{" "}
          <Link href={`${page.base}/plus/abonnement#sms`} className="font-medium text-accent underline">
            {t("smsOpen")}
          </Link>
        </p>
      )}

      <div className={`grid gap-6 ${showStats ? "lg:grid-cols-3" : ""}`}>
        {/* Agenda du jour : le cœur de l'accueil. */}
        <section
          aria-labelledby="rdv-du-jour"
          className={`${panel} min-w-0 ${showStats ? "lg:col-span-2" : ""}`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="rdv-du-jour"
              className="flex items-center gap-3 font-display text-[1.2rem] font-semibold text-night"
            >
              {t("title")}
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-sans text-sm font-medium text-accent-strong">
                {t("count", { count: summary.count })}
              </span>
            </h2>
            <Link
              href={`${page.base}/agenda`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-[0.9375rem] font-medium text-accent hover:bg-accent-soft"
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
                  <h3 className="text-sm font-medium uppercase tracking-[0.08em] text-ink-soft">
                    {t("upcoming")}
                  </h3>
                  <DayTimeline
                    items={upcoming}
                    tenantId={page.tenantId}
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
              tenantId={page.tenantId}
              base={page.base}
              time={page.fmt.time}
              nextId={summary.nextId}
              now={now}
            />
          )}
        </section>

        {/* Deux chiffres clés, sans graphique (le nombre de rendez-vous est déjà dans l'agenda). */}
        {showStats && (
          <aside aria-label={t("keyFigures")} className="min-w-0 space-y-3">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <StatCard
                icon={DASH_ICONS.euro}
                tone="green"
                label={t("revenue")}
                value={page.fmt.money(summary.revenueCents)}
                sub={t("todayOnline", { count: online })}
              />
              <StatCard
                icon={DASH_ICONS.chart}
                tone="violet"
                label={t("weekRevenue")}
                value={page.fmt.money(stats.weekCents)}
                sub={
                  <Trend
                    value={trendPercent(stats.weekCents, stats.previousWeekCents)}
                    label={t("trendLabel")}
                  />
                }
              />
            </div>
            <Link
              href={`${page.base}/plus/statistiques`}
              className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-hairline bg-white px-4 text-[0.95rem] font-medium text-accent transition hover:border-accent-line"
            >
              {t("statsLink")}
              <DashIcon d={DASH_ICONS.arrow} className="h-4 w-4" />
            </Link>
          </aside>
        )}
      </div>

      {/* Rappels tant que l'application ou les notifications ne sont pas activées (gérante seulement). */}
      {page.role !== "admin" && (
        <div className="space-y-6 empty:hidden">
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
          {isOwner && (
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
        </div>
      )}
    </div>
  );
}
