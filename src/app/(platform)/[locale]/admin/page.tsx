import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { liveRevenue } from "@/modules/billing/admin";
import { listPendingOrders } from "@/modules/orders/orders";
import { getDashboardStats } from "@/modules/tenants/queries";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "admin" });
  return { title: t("metaTitle") };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={ui.card}>
      <p className="text-sm text-ink/70">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold text-night">{value}</p>
    </div>
  );
}

/** Accueil de l'espace admin : chiffres clés et alertes. */
export default async function AdminHomePage({ params }: PageProps<"/[locale]/admin">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, stats, revenue] = await Promise.all([
    getTranslations("admin"),
    adminQuery((tx) => getDashboardStats(tx)),
    adminQuery((tx) => liveRevenue(tx)),
  ]);
  const pendingOrders = (await adminQuery((tx) => listPendingOrders(tx))).filter(
    (row) => row.order.status !== "in_creation",
  ).length;

  return (
    <main id="contenu" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t("dashboard.activeClients")} value={stats.activeClients} />
        <Stat
          label={t("dashboard.monthlyRevenue")}
          value={formatMoney(revenue.monthlyRevenueCents, "EUR", locale)}
        />
        <Stat label={t("dashboard.newThisMonth")} value={stats.newThisMonth} />
        <Stat label={t("dashboard.cancelledThisMonth")} value={stats.cancelledThisMonth} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={ui.card}>
          <h2 className="text-xl font-bold">{t("dashboard.byPlan")}</h2>
          <ul className="mt-4 divide-y divide-navy/10">
            {stats.byPlan.map((plan) => (
              <li key={plan.code} className="flex justify-between py-3">
                <Link
                  href={{ pathname: "/admin/clients", query: { plan: plan.code, status: "active" } }}
                  className="font-semibold text-night underline"
                >
                  {pickLocalized(plan.name, locale)}
                </Link>
                <span className="font-bold">{plan.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={ui.card}>
          <h2 className="text-xl font-bold">{t("dashboard.alerts")}</h2>
          <ul className="mt-4 space-y-3">
            {pendingOrders > 0 && (
              <li>
                <Link href="/admin/commandes" className="font-semibold text-coral-dark underline">
                  {t("dashboard.pendingOrders", { count: pendingOrders })}
                </Link>
              </li>
            )}
            {revenue.pastDue > 0 && (
              <li>
                <Link href="/admin/paiements" className="font-semibold text-coral-dark underline">
                  {t("dashboard.pastDue", { count: revenue.pastDue })}
                </Link>
              </li>
            )}
            {stats.drafts > 0 && (
              <li>
                <Link
                  href={{ pathname: "/admin/clients", query: { status: "draft" } }}
                  className="font-semibold text-night underline"
                >
                  {t("dashboard.drafts")} : {stats.drafts}
                </Link>
              </li>
            )}
            {stats.openRequests > 0 && (
              <li>
                <Link href="/admin/demandes" className="font-semibold text-night underline">
                  {t("dashboard.openRequests", { count: stats.openRequests })}
                </Link>
              </li>
            )}
            {stats.basicAtLimit.map((tenant) => (
              <li key={tenant.id}>
                <Link href={`/admin/clients/${tenant.id}`} className="text-night underline">
                  {t("dashboard.basicAtLimit", { name: tenant.name, count: tenant.bookings })}
                </Link>
              </li>
            ))}
            {revenue.pastDue === 0 &&
              pendingOrders === 0 &&
              stats.drafts === 0 &&
              stats.openRequests === 0 &&
              stats.basicAtLimit.length === 0 && <li className="text-ink/70">{t("dashboard.noAlerts")}</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
