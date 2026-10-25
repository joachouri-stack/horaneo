import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { firstPlanWith } from "@/modules/billing/plans";
import { utcToLocal } from "@/modules/booking/time";
import { monthStats } from "@/modules/stats/month";

const shift = (period: string, delta: number) => {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Statistiques du mois ; le détail (prestations, nouvelles clientes) est réservé au pack qui l'inclut. */
export default async function StatsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/statistiques">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.stats");
  const current = utcToLocal(new Date(), page.tenant.timezone).date.slice(0, 7);
  const requested = (await searchParams).mois;
  const period =
    typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested <= current
      ? requested
      : current;
  const stats = await page.db((tx) =>
    monthStats(tx, page.tenantId, period, page.tenant.timezone, page.locale),
  );
  const detailed = Boolean(page.tenant.features.stats);
  const label = new Intl.DateTimeFormat(page.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}-15T12:00:00Z`));
  const cards = [
    { label: t("appointments"), value: String(stats.appointments) },
    { label: t("revenue"), value: page.fmt.money(stats.revenueCents) },
    { label: t("online"), value: String(stats.online) },
    { label: t("manual"), value: String(stats.manual) },
    { label: t("cancelled"), value: String(stats.cancelled) },
    { label: t("noShowRate"), value: `${Math.round(stats.noShowRate * 100)} %` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <div className="flex items-center justify-between">
        <Link
          href={`${page.base}/plus/statistiques?mois=${shift(period, -1)}`}
          className="inline-flex min-h-11 items-center font-semibold text-night underline"
        >
          ← {t("previous")}
        </Link>
        <span className="font-semibold first-letter:uppercase">{label}</span>
        {period < current ? (
          <Link
            href={`${page.base}/plus/statistiques?mois=${shift(period, 1)}`}
            className="inline-flex min-h-11 items-center font-semibold text-night underline"
          >
            {t("next")} →
          </Link>
        ) : (
          <span />
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-[var(--radius-card)] bg-white p-4 shadow-sm">
            <dd className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
              {card.value}
            </dd>
            <dt className="text-sm text-ink/70">{card.label}</dt>
          </div>
        ))}
      </dl>
      {detailed ? (
        <section className={ui.card}>
          <p className="mb-3">
            {t("newCustomers")} : <strong>{stats.newCustomers}</strong>
          </p>
          <h2 className="text-lg font-semibold">{t("topServices")}</h2>
          {stats.topServices.length === 0 ? (
            <p className="text-ink/60">{t("none")}</p>
          ) : (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {stats.topServices.map(([name, count]) => (
                <li key={name}>
                  {name} <span className="text-ink/60">({count})</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <p className="text-ink/70">
          {t("detailed", {
            plan: (await page.db((tx) => firstPlanWith(tx, "stats", page.locale))) ?? "none",
          })}
        </p>
      )}
    </div>
  );
}
