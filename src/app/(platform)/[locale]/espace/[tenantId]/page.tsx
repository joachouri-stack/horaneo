import { getTranslations } from "next-intl/server";
import { AppointmentCard } from "@/components/manager/AppointmentCard";
import { InstallAppCard } from "@/components/manager/InstallAppCard";
import { PushReminder } from "@/components/manager/PushReminder";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { todaySummary, upcomingAppointments } from "@/modules/agenda/queries";
import { smsUsage } from "@/modules/messages/sms-usage";
import { getPlatformSetting } from "@/modules/settings";

/**
 * Écran « Aujourd'hui » : un bouton pour ajouter un rendez-vous, trois chiffres, les
 * rendez-vous du jour (ou les prochains si la journée est vide) et « Je ne suis pas disponible ».
 */
export default async function TodayPage({ params }: PageProps<"/[locale]/espace/[tenantId]">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.today");
  const [summary, sms, warningPercent] = await page.db(
    async (tx) =>
      [
        await todaySummary(tx, page.tenantId, page.tenant.timezone, page.locale),
        await smsUsage(tx, page.tenantId),
        await getPlatformSetting(tx, "sms_warning_percent"),
      ] as const,
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
    timeZone: page.tenant.timezone,
  });
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
      <div className="space-y-3">
        <h1 className="text-2xl font-extrabold first-letter:uppercase">{page.fmt.day(new Date())}</h1>
        <Link href={`${page.base}/rendez-vous/nouveau`} className={`${ui.primaryButton} gap-2 sm:w-auto`}>
          <span aria-hidden="true" className="text-2xl leading-none">
            +
          </span>
          {t("add")}
        </Link>
      </div>

      {smsAlert && (
        <p role="status" className={`${ui.card} border-coral/40 bg-blush`}>
          {smsAlert}{" "}
          <Link href={`${page.base}/plus/abonnement#sms`} className="font-semibold underline">
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

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: t("appointments"), value: String(summary.count) },
          { label: t("revenue"), value: page.fmt.money(summary.revenueCents) },
          { label: t("newBookings"), value: String(summary.newBookings) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="min-w-0 rounded-[var(--radius-card)] bg-white px-1.5 py-3 text-center shadow-sm min-[400px]:p-3"
          >
            <dd className="font-display text-lg font-extrabold whitespace-nowrap text-night tabular-nums min-[400px]:text-xl sm:text-2xl">
              {stat.value}
            </dd>
            <dt className="mt-1 text-xs leading-tight text-ink/70">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <section aria-labelledby="rdv-du-jour" className="space-y-3">
        <h2 id="rdv-du-jour" className="text-lg font-bold">
          {t("title")}
        </h2>
        {summary.appointments.length === 0 ? (
          <div className="space-y-3">
            <p className={ui.card}>{t("empty")}</p>
            {upcoming.length > 0 && (
              <>
                <h3 className="pt-2 font-bold">{t("upcoming")}</h3>
                <ul className="space-y-3">
                  {upcoming.map((item) => (
                    <li key={item.id}>
                      <AppointmentCard
                        item={item}
                        href={`${page.base}/rendez-vous/${item.id}`}
                        day={shortDay.format(item.startsAt)}
                        time={page.fmt.time(item.startsAt)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {summary.appointments.map((item) => (
              <li key={item.id}>
                <AppointmentCard
                  item={item}
                  href={`${page.base}/rendez-vous/${item.id}`}
                  time={page.fmt.time(item.startsAt)}
                  highlight={item.id === summary.nextId}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Une seule entrée pour les absences : la page propose ensuite créneau, congés ou fermeture. */}
      <Link href={`${page.base}/indisponibilites`} className={ui.secondaryButton}>
        {t("unavailable")}
      </Link>
    </div>
  );
}
