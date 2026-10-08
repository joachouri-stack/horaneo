import { getTranslations, setRequestLocale } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate, formatMoney } from "@/lib/format";
import { listSubscriptions, liveRevenue, smsMonthlyTotals } from "@/modules/billing/admin";

/** Abonnements des clients : revenu, échéances, échecs de prélèvement. */
export default async function BillingAdminPage({ params }: PageProps<"/[locale]/admin/paiements">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, { rows, revenue, sms }] = await Promise.all([
    getTranslations("admin.billing"),
    adminQuery(async (tx) => ({
      rows: await listSubscriptions(tx),
      revenue: await liveRevenue(tx),
      sms: await smsMonthlyTotals(tx),
    })),
  ]);
  const statusLabel = (status: string) =>
    t.has(`statuses.${status}` as "statuses.active") ? t(`statuses.${status}` as "statuses.active") : status;
  return (
    <main id="contenu" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={ui.card}>
          <p className="text-sm text-ink/70">{t("revenue")}</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-night">
            {formatMoney(revenue.monthlyRevenueCents, "EUR", locale)}
          </p>
        </div>
        <div className={ui.card}>
          <p className="text-sm text-ink/70">{t("paying")}</p>
          <p className="mt-1 font-display text-3xl font-extrabold text-night">{revenue.paying}</p>
        </div>
        <div className={ui.card}>
          <p className="text-sm text-ink/70">{t("pastDue")}</p>
          <p
            className={`mt-1 font-display text-3xl font-extrabold ${revenue.pastDue ? "text-coral-dark" : "text-night"}`}
          >
            {revenue.pastDue}
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink/70">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ subscription: sub, tenantName, planName, scheduledPlanName }) => (
            <li key={sub.id} className={`${ui.card} ${sub.paymentFailedAt ? "ring-2 ring-coral" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/admin/clients/${sub.tenantId}`}
                  className="text-lg font-bold text-night underline"
                >
                  {tenantName}
                </Link>
                <span className="font-semibold">
                  {pickLocalized(planName, locale)} · {statusLabel(sub.status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink/70">
                {[
                  sub.currentPeriodEnd && `${t("next")} : ${formatDate(sub.currentPeriodEnd, locale)}`,
                  sub.commitmentEndsAt && t("commitment", { date: formatDate(sub.commitmentEndsAt, locale) }),
                  scheduledPlanName && t("scheduled", { name: pickLocalized(scheduledPlanName, locale) }),
                  sub.cancelAt && t("cancelAt", { date: formatDate(sub.cancelAt, locale) }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {sub.paymentFailedAt && (
                <p className="mt-2 font-semibold text-coral-dark">
                  {t("failedOn", { date: formatDate(sub.paymentFailedAt, locale) })}
                  {sub.lastPaymentError && ` : ${sub.lastPaymentError}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* SMS de tous les clients, mois par mois : coût chez le fournisseur et packs vendus. */}
      <section aria-labelledby="titre-sms" className={ui.card}>
        <h2 id="titre-sms" className="text-xl font-bold">
          {t("sms.title")}
        </h2>
        {sms.length === 0 ? (
          <p className="mt-2 text-ink/70">{t("sms.empty")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="text-ink/70">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {t("sms.period")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    {t("sms.total")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    {t("sms.fromQuota")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">
                    {t("sms.fromPacks")}
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    {t("sms.packsSold")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {sms.map((row) => (
                  <tr key={row.period}>
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {row.period}
                    </th>
                    <td className="py-2 pr-3 text-right font-bold text-night">{row.total}</td>
                    <td className="py-2 pr-3 text-right">{row.fromQuota}</td>
                    <td className="py-2 pr-3 text-right">{row.fromPacks}</td>
                    <td className="py-2 text-right">
                      {row.packsSold > 0
                        ? `${row.packsSold} · ${formatMoney(row.packsRevenueCents, "EUR", locale)}`
                        : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
