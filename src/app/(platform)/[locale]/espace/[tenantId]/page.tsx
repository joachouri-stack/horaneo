import { getTranslations } from "next-intl/server";
import { AppointmentCard } from "@/components/manager/AppointmentCard";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { todaySummary } from "@/modules/agenda/queries";

/** Écran « Aujourd'hui » : trois chiffres, les rendez-vous du jour, ajout rapide. */
export default async function TodayPage({ params }: PageProps<"/[locale]/espace/[tenantId]">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.today");
  const summary = await page.db((tx) => todaySummary(tx, page.tenantId, page.tenant.timezone, page.locale));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold first-letter:uppercase">{page.fmt.day(new Date())}</h1>
        <Link
          href={`${page.base}/rendez-vous/nouveau`}
          aria-label={t("add")}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-coral text-3xl font-bold text-white shadow-lg hover:bg-coral-dark"
        >
          +
        </Link>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: t("appointments"), value: String(summary.count) },
          { label: t("revenue"), value: page.fmt.money(summary.revenueCents) },
          { label: t("newBookings"), value: String(summary.newBookings) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-card)] bg-white p-3 text-center shadow-sm">
            <dd className="font-display text-xl font-extrabold text-navy sm:text-2xl">{stat.value}</dd>
            <dt className="mt-1 text-xs leading-tight text-ink/70">{stat.label}</dt>
          </div>
        ))}
      </dl>

      <section aria-labelledby="rdv-du-jour" className="space-y-3">
        <h2 id="rdv-du-jour" className="text-lg font-bold">
          {t("title")}
        </h2>
        {summary.appointments.length === 0 ? (
          <p className={ui.card}>{t("empty")}</p>
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

      <section aria-labelledby="actions-rapides">
        <h2 id="actions-rapides" className="mb-3 text-lg font-bold">
          {t("quick")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["block", "leave", "closure"] as const).map((kind) => (
            <Link
              key={kind}
              href={`${page.base}/indisponibilites?type=${kind}`}
              className={ui.secondaryButton}
            >
              {t(kind)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
