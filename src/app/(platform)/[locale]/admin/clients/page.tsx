import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { pickLocalized } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { FiltersDisclosure } from "@/components/admin/FiltersDisclosure";
import { countTenants, listPlans, listTenants } from "@/modules/tenants/queries";

/** Liste affichée par tranches : « Afficher plus » ajoute la tranche suivante. */
const PAGE_SIZE = 50;
const MAX_SHOWN = 1000;

/** Liste des clients avec recherche et filtres (pack, statut). */
export default async function ClientsPage({ params, searchParams }: PageProps<"/[locale]/admin/clients">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const query = await searchParams;
  const value = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const filters = { q: value("q"), plan: value("plan"), status: value("status") };
  const shown = Math.min(Math.max(Number(value("n")) || PAGE_SIZE, PAGE_SIZE), MAX_SHOWN);

  const [t, tStatus, tCommon, { rows, total, plans }] = await Promise.all([
    getTranslations("admin.clients"),
    getTranslations("status"),
    getTranslations("common"),
    // Requêtes l'une après l'autre : elles partagent la connexion de la transaction.
    adminQuery(async (tx) => ({
      rows: await listTenants(tx, filters, shown),
      total: await countTenants(tx, filters),
      plans: await listPlans(tx),
    })),
  ]);
  const moreHref = {
    pathname: "/admin/clients",
    query: {
      ...Object.fromEntries(Object.entries(filters).filter(([, item]) => item)),
      n: String(shown + PAGE_SIZE),
    },
  };
  // Packs en vente d'abord ; les anciens packs à part (ils peuvent encore avoir des clients).
  const planOption = (plan: (typeof plans)[number]) => (
    <option key={plan.code} value={plan.code}>
      {pickLocalized(plan.name, locale)}
    </option>
  );
  const oldPlans = plans.filter((plan) => !plan.isPublic);

  const tIntro = await getTranslations("admin.intro");
  return (
    <main id="contenu" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t("title")}</h1>
        <Link href="/admin/clients/nouveau" className={`${ui.primaryButton} sm:w-auto`}>
          {t("newClient")}
        </Link>
      </div>
      <p className="text-ink/70">{tIntro("clients")}</p>

      <form method="get" className={`${ui.card} space-y-4`}>
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="q" className={ui.label}>
              {t("searchPlaceholder")}
            </label>
            <input id="q" name="q" type="search" defaultValue={filters.q} className={ui.input} />
          </div>
          <button type="submit" className={`${ui.secondaryButton} w-auto shrink-0`}>
            {tCommon("search")}
          </button>
        </div>
        <FiltersDisclosure summary={t("filters")} active={Boolean(filters.plan || filters.status)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="plan" className={ui.label}>
                {t("plan")}
              </label>
              <select id="plan" name="plan" defaultValue={filters.plan} className={ui.input}>
                <option value="">{t("allPlans")}</option>
                {oldPlans.length === 0 ? (
                  plans.map(planOption)
                ) : (
                  <>
                    <optgroup label={t("plansOnSale")}>
                      {plans.filter((plan) => plan.isPublic).map(planOption)}
                    </optgroup>
                    <optgroup label={t("plansOld")}>{oldPlans.map(planOption)}</optgroup>
                  </>
                )}
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
          </div>
        </FiltersDisclosure>
      </form>

      <p className="text-ink/70">{t("count", { count: total })}</p>
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
                    <p className="text-lg font-bold text-night">{row.name}</p>
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
      {total > rows.length && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-ink/70">{t("partial", { shown: rows.length, total })}</p>
          {shown < MAX_SHOWN ? (
            <Link href={moreHref} className={`${ui.secondaryButton} sm:w-auto`}>
              {t("showMore")}
            </Link>
          ) : (
            <p className="text-sm text-ink/70">{t("refineSearch")}</p>
          )}
        </div>
      )}
    </main>
  );
}
