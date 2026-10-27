import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { PLATFORM_CURRENCY } from "@/config/billing";
import { formatMoney } from "@/lib/format";
import { billingGateway } from "@/lib/payments/stripe-billing";
import { paymentGateway } from "@/lib/payments/stripe";
import { liveRevenue } from "@/modules/billing/admin";
import { listPendingOrders } from "@/modules/orders/orders";
import { salesOpen } from "@/modules/legal/documents";
import { getDashboardStats } from "@/modules/tenants/queries";
import { siteReadiness } from "@/modules/tenants/readiness";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "admin" });
  return { title: t("metaTitle") };
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-white p-4 shadow-sm">
      <p className="text-sm text-ink/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-night">{value}</p>
    </div>
  );
}

type Todo = {
  key: string;
  text: string;
  href: string | { pathname: string; query?: Record<string, string> };
  action: string;
  urgent?: boolean;
};

/**
 * Accueil de l'espace admin : d'abord la liste « À faire » (une ligne = une action),
 * triée par urgence, puis les chiffres clés.
 */
export default async function AdminHomePage({ params }: PageProps<"/[locale]/admin">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, stats, revenue, open] = await Promise.all([
    getTranslations("admin"),
    adminQuery((tx) => getDashboardStats(tx)),
    adminQuery((tx) => liveRevenue(tx)),
    adminQuery((tx) => salesOpen(tx)),
  ]);
  const [pendingOrders, readiness] = await Promise.all([
    adminQuery((tx) => listPendingOrders(tx)).then(
      (rows) => rows.filter((row) => row.order.status !== "in_creation").length,
    ),
    adminQuery((tx) =>
      siteReadiness(
        tx,
        stats.draftTenants.map((tenant) => tenant.id),
      ),
    ),
  ]);
  const tTodo = await getTranslations("admin.dashboard.todo");
  const list = new Intl.ListFormat(locale, { type: "conjunction" });

  // Du plus urgent au moins urgent : ventes bloquées, argent, sites à finir, demandes.
  const todos: Todo[] = [];
  if (!open)
    todos.push({
      key: "sales",
      text: tTodo("salesClosed"),
      href: "/admin/documents",
      action: tTodo("open"),
      urgent: true,
    });
  // Paiement par carte non configuré sur ce serveur : ni abonnement ni acompte possibles.
  if (!billingGateway() || !paymentGateway())
    todos.push({
      key: "payments",
      text: tTodo("paymentsMissing"),
      href: "/admin/paiements",
      action: tTodo("see"),
      urgent: true,
    });
  if (pendingOrders > 0)
    todos.push({
      key: "orders",
      text: t("dashboard.pendingOrders", { count: pendingOrders }),
      href: "/admin/commandes",
      action: tTodo("review"),
      urgent: true,
    });
  if (revenue.pastDue > 0)
    todos.push({
      key: "pastDue",
      text: t("dashboard.pastDue", { count: revenue.pastDue }),
      href: "/admin/paiements",
      action: tTodo("see"),
      urgent: true,
    });
  for (const tenant of stats.draftTenants) {
    const missing = readiness.find((item) => item.tenantId === tenant.id)?.missing ?? [];
    todos.push({
      key: `draft-${tenant.id}`,
      text:
        missing.length === 0
          ? tTodo("draftReady", { name: tenant.name })
          : tTodo("draftMissing", {
              name: tenant.name,
              missing: list.format(missing.map((key) => tTodo(`missing.${key}`))),
            }),
      href: `/admin/clients/${tenant.id}`,
      action: missing.length === 0 ? tTodo("goLive") : tTodo("complete"),
    });
  }
  if (stats.openRequests > 0)
    todos.push({
      key: "requests",
      text: t("dashboard.openRequests", { count: stats.openRequests }),
      href: "/admin/demandes",
      action: tTodo("review"),
    });
  for (const tenant of stats.basicAtLimit)
    todos.push({
      key: `limit-${tenant.id}`,
      text: t("dashboard.basicAtLimit", { name: tenant.name, count: tenant.bookings }),
      href: `/admin/clients/${tenant.id}`,
      action: tTodo("see"),
    });

  return (
    <main id="contenu" className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>

      <section aria-labelledby="a-faire" className="space-y-3">
        <h2 id="a-faire" className="text-xl font-bold">
          {tTodo("title")}
        </h2>
        {todos.length === 0 ? (
          <p className={ui.card}>{tTodo("empty")}</p>
        ) : (
          <ul className="divide-y divide-navy/10 rounded-[var(--radius-card)] bg-white shadow-sm">
            {todos.map((todo) => (
              <li
                key={todo.key}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <p className="flex items-start gap-3 font-semibold text-night">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 size-2.5 shrink-0 rounded-full ${todo.urgent ? "bg-coral" : "bg-navy/30"}`}
                  />
                  {todo.text}
                </p>
                <Link href={todo.href} className={`${ui.secondaryButton} shrink-0 sm:w-auto`}>
                  {todo.action} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="chiffres" className="space-y-3">
        <h2 id="chiffres" className="text-xl font-bold">
          {tTodo("figures")}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("dashboard.activeClients")} value={stats.activeClients} />
          <Stat
            label={t("dashboard.monthlyRevenue")}
            value={formatMoney(revenue.monthlyRevenueCents, PLATFORM_CURRENCY, locale)}
          />
          <Stat label={t("dashboard.newThisMonth")} value={stats.newThisMonth} />
          <Stat label={t("dashboard.cancelledThisMonth")} value={stats.cancelledThisMonth} />
        </div>
        <details className={ui.card}>
          <summary className="cursor-pointer py-2.5 font-bold">{t("dashboard.byPlan")}</summary>
          <ul className="mt-4 divide-y divide-navy/10">
            {/* Anciens packs qui ne sont plus en vente : seulement s'ils ont encore des clients. */}
            {stats.byPlan
              .filter((plan) => plan.isPublic || plan.count > 0)
              .map((plan) => (
                <li key={plan.code}>
                  <Link
                    href={{ pathname: "/admin/clients", query: { plan: plan.code, status: "active" } }}
                    className="flex min-h-11 items-center justify-between gap-3 py-2 font-semibold text-night"
                  >
                    <span className="underline">{pickLocalized(plan.name, locale)}</span>
                    <span className="font-bold">{plan.count}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      </section>
    </main>
  );
}
