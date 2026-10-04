import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { listPlans, listTenants } from "@/modules/tenants/queries";

/** Liste des clients avec recherche et filtres (pack, statut). */
export default async function ClientsPage({ params, searchParams }: PageProps<"/[locale]/admin/clients">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const filters = { q: value("q"), plan: value("plan"), status: value("status") };

  const [t, tStatus, tCommon, { rows, plans }] = await Promise.all([
    getTranslations("admin.clients"),
    getTranslations("status"),
    getTranslations("common"),
    adminQuery(async (tx) => ({ rows: await listTenants(tx, filters), plans: await listPlans(tx) })),
  ]);

  return (
    <main id="contenu" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>

      <form method="get" className={`${ui.card} grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end`}>
        <div>
          <label htmlFor="q" className={ui.label}>
            {t("searchPlaceholder")}
          </label>
          <input id="q" name="q" type="search" defaultValue={filters.q} className={ui.input} />
        </div>
        <div>
          <label htmlFor="plan" className={ui.label}>
            {t("plan")}
          </label>
          <select id="plan" name="plan" defaultValue={filters.plan} className={ui.input}>
            <option value="">—</option>
            {plans.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {pickLocalized(plan.name, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status" className={ui.label}>
            {t("status")}
          </label>
          <select id="status" name="status" defaultValue={filters.status} className={ui.input}>
            <option value="">{t("activeOnly")}</option>
            {(["draft", "active", "suspended", "cancelled", "deleted"] as const).map((status) => (
              <option key={status} value={status}>
                {tStatus(status)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={`${ui.secondaryButton} sm:w-auto`}>
          {tCommon("search")}
        </button>
      </form>

      <p className="text-ink/70">{t("count", { count: rows.length })}</p>
      {rows.length === 0 ? (
        <p className={ui.card}>{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/clients/${row.id}`}
                className={`${ui.card} block hover:ring-2 hover:ring-navy/20`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-navy">{row.name}</p>
                    <p className="text-sm text-ink/70">{row.primaryHostname}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <p className="mt-3 text-sm text-ink/70">
                  {pickLocalized(row.planName, locale)}
                  {row.city ? ` · ${row.city}` : ""} ·{" "}
                  {t("createdOn", { date: formatDate(row.createdAt, locale) })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
