import { getTranslations } from "next-intl/server";
import { DASH_ICONS, DashIcon, panel } from "@/components/manager/DashboardWidgets";
import { initials } from "@/components/manager/DayTimeline";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import {
  CUSTOMER_SEGMENT_KEYS,
  CUSTOMER_SORT_KEYS,
  customerDirectory,
  type CustomerSegment,
  type CustomerSort,
} from "@/modules/customers/customers";
import { formatPhone } from "@/modules/phone";
import { CUSTOMER_SEGMENTS } from "@/config/customers";
import { CustomerListControls } from "@/components/manager/CustomerListControls";

/** Fiches affichées d'abord, puis ajoutées à chaque « Afficher plus » (plafond pour le téléphone). */
const PAGE_SIZE = 200;
const MAX_SHOWN = 1000;

/** Couleurs des pastilles d'initiales : fixes pour une même cliente. */
const AVATAR_COLORS = [
  "bg-[#e8ebfa] text-[#3a4bb8]",
  "bg-[#fbe8ee] text-[#9c3458]",
  "bg-[#e3f4ee] text-[#1f7a5f]",
  "bg-[#fdf1e0] text-[#8a5212]",
  "bg-[#efe9fb] text-[#6a4bc4]",
  "bg-[#e2f2f6] text-[#1f6f86]",
];

function avatarColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const BADGES = {
  loyal: "bg-[#e8ebfa] text-[#3a4bb8]",
  new: "bg-[#e3f4ee] text-[#1f7a5f]",
  inactive: "bg-[#fdf3e2] text-[#8a5212]",
  blocked: "bg-[#fdecea] text-[#8f2a20]",
} as const;

/** Fichier clientes : chiffres clés, filtres par groupe, recherche et liste détaillée. */
export default async function CustomersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/clientes">) {
  const page = await managerPage(params, "customers");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const segment: CustomerSegment = CUSTOMER_SEGMENT_KEYS.includes(query.groupe as CustomerSegment)
    ? (query.groupe as CustomerSegment)
    : "all";
  const sort: CustomerSort = CUSTOMER_SORT_KEYS.includes(query.tri as CustomerSort)
    ? (query.tri as CustomerSort)
    : "name";
  const t = await getTranslations("manager.customers");
  // « Pas revenus depuis 2 mois » : le délai réglé, en mois.
  const inactiveMonths = Math.max(1, Math.round(CUSTOMER_SEGMENTS.inactiveDays / 30));
  const tCommon = await getTranslations("common");
  const now = new Date();
  // Liste affichée par tranches : « Afficher plus » ajoute la tranche suivante.
  const shown = Math.min(Math.max(Number(query.n) || PAGE_SIZE, PAGE_SIZE), MAX_SHOWN);
  const {
    customers: list,
    counts,
    matching,
  } = await page.db((tx) =>
    customerDirectory(tx, page.tenantId, { query: q, segment, sort, now, limit: shown }),
  );

  /** Lien de la liste : groupe, recherche et tri gardés sauf ceux changés. */
  const listHref = (changes: { groupe?: CustomerSegment; q?: string; tri?: CustomerSort; n?: number }) => {
    const next = { groupe: segment, q, tri: sort, ...changes };
    const search = new URLSearchParams();
    if (next.groupe !== "all") search.set("groupe", next.groupe);
    if (next.q) search.set("q", next.q);
    if (next.tri !== "name") search.set("tri", next.tri);
    if (changes.n) search.set("n", String(changes.n));
    const text = search.toString();
    return `${page.base}/clientes${text ? `?${text}` : ""}`;
  };
  const moreHref = () => listHref({ n: shown + PAGE_SIZE });
  const href = (next: CustomerSegment) => listHref({ groupe: next });
  // Export du fichier clients (page « Exporter ») : la gérante seulement.

  return (
    // Recherche d'abord (sur téléphone), puis les filtres et la liste : les nombres sont sur les filtres.
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {t("title")}
          </h1>
          <p className="mt-1 text-ink-soft">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${page.base}/clientes/importer`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-hairline bg-white px-5 text-[0.95rem] font-medium text-night transition hover:border-accent-line"
          >
            {t("importLink")}
          </Link>
          <Link
            href={`${page.base}/clientes/nouvelle`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[0.95rem] font-medium text-white shadow-[0_1px_2px_rgba(15,24,48,.08)] transition hover:bg-accent-strong"
          >
            <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
            {t("new")}
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <form method="get" role="search" className="flex gap-2 lg:w-96">
          {segment !== "all" && <input type="hidden" name="groupe" value={segment} />}
          {sort !== "name" && <input type="hidden" name="tri" value={sort} />}
          <label htmlFor="q" className="sr-only">
            {t("search")}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("search")}
            className={`${ui.input} min-w-0 flex-1`}
          />
          <button
            type="submit"
            aria-label={tCommon("search")}
            className="inline-flex min-h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-accent-strong"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4.2-4.2" />
            </svg>
          </button>
        </form>
      </div>

      {/* Groupe affiché et ordre de la liste : deux petits menus. */}
      <CustomerListControls
        showLabel={t("show")}
        sortLabel={t("sortLabel")}
        group={segment}
        sort={sort}
        groups={CUSTOMER_SEGMENT_KEYS.filter(
          (key) => key !== "blocked" || counts.blocked > 0 || segment === key,
        ).map((key) => ({
          value: key,
          label: `${t(`filter.${key}`, { months: inactiveMonths })} (${counts[key]})`,
          href: href(key),
        }))}
        sorts={CUSTOMER_SORT_KEYS.map((key) => ({
          value: key,
          label: t(`sort.${key}`),
          href: listHref({ tri: key }),
        }))}
      />
      {/* Groupe choisi : ce qu'il contient (groupes calculés automatiquement). */}
      {segment !== "all" && (
        <p className="-mt-2 text-[0.9375rem] text-ink-soft">
          {t(`filterHint.${segment}`, {
            visits: CUSTOMER_SEGMENTS.loyalVisits,
            days: CUSTOMER_SEGMENTS.newDays,
            months: inactiveMonths,
          })}
          {segment === "inactive" && (
            <>
              {" "}
              <Link href={`${page.base}/plus/fidelite`} className="font-medium text-accent underline">
                {t("winbackLink")}
              </Link>
            </>
          )}
        </p>
      )}

      {list.length === 0 ? (
        <div className={`${panel} space-y-4`}>
          <p className="text-ink-soft">{segment === "all" ? t("empty") : t("emptyFilter")}</p>
          {/* Recherche sans résultat : l'effacer, ou créer la fiche. */}
          {q && (
            <div className="flex flex-wrap gap-2">
              <Link href={listHref({ q: "" })} className={`${ui.secondaryButton} sm:w-auto`}>
                {t("clearSearch")}
              </Link>
              <Link href={`${page.base}/clientes/nouvelle`} className={`${ui.primaryButton} sm:w-auto`}>
                {t("createFromSearch")}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className={`${panel} !p-0`}>
          {/* En-têtes du tableau, sur ordinateur seulement. */}
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,2.2fr)_0.8fr_0.9fr_1fr_1fr] gap-4 border-b border-hairline px-6 py-3 text-sm font-medium uppercase tracking-[0.06em] text-ink-soft lg:grid"
          >
            <span>{t("colCustomer")}</span>
            <span>{t("colVisits")}</span>
            <span>{t("spent")}</span>
            <span>{t("colLastVisit")}</span>
            <span>{t("colNextVisit")}</span>
          </div>
          <ul className="divide-y divide-hairline">
            {list.map((customer) => {
              const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
              // Une seule étiquette : bloqué d'abord, puis à relancer, fidèle, nouvelle.
              const badge = customer.blocked
                ? "blocked"
                : customer.inactive
                  ? "inactive"
                  : customer.loyal
                    ? "loyal"
                    : customer.isNew
                      ? "new"
                      : null;
              return (
                <li key={customer.id}>
                  <Link
                    href={`${page.base}/clientes/${customer.id}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4 transition hover:bg-mist-50 sm:px-6 lg:grid-cols-[minmax(0,2.2fr)_0.8fr_0.9fr_1fr_1fr] lg:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-3 max-lg:contents">
                      <span
                        aria-hidden="true"
                        className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(customer.id)}`}
                      >
                        {initials(name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-medium text-night">{name}</span>
                          {badge && (
                            <span
                              className={`rounded-full px-2 py-px text-[0.8125rem] font-medium ${BADGES[badge]}`}
                            >
                              {t(`badge.${badge}`)}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-sm text-ink-soft">
                          {customer.phone ? formatPhone(customer.phone) : customer.email}
                        </span>
                      </span>
                    </span>

                    {/* Téléphone : une ligne de résumé sous le nom. */}
                    <span className="col-start-2 text-sm text-ink-soft lg:hidden">
                      {customer.nextVisit
                        ? t("summaryNext", {
                            visits: t("visitsCount", { count: customer.visits }),
                            date: page.fmt.short(customer.nextVisit),
                          })
                        : customer.lastVisit
                          ? t("summaryLast", {
                              visits: t("visitsCount", { count: customer.visits }),
                              date: page.fmt.short(customer.lastVisit),
                            })
                          : t("summaryNever")}
                    </span>

                    {/* Ordinateur : colonnes. */}
                    <span className="hidden text-night tabular-nums lg:block">{customer.visits}</span>
                    <span className="hidden text-night tabular-nums lg:block">
                      {customer.spentCents > 0 ? (
                        page.fmt.money(customer.spentCents)
                      ) : (
                        <span className="text-ink-soft">{t("noNextVisit")}</span>
                      )}
                    </span>
                    <span className="hidden text-[0.9375rem] text-ink-soft lg:block">
                      {customer.lastVisit ? page.fmt.short(customer.lastVisit) : t("never")}
                    </span>
                    <span className="hidden text-[0.9375rem] lg:block">
                      {customer.nextVisit ? (
                        <span className="rounded-full bg-accent-soft px-2.5 py-1 font-medium text-accent-strong">
                          {page.fmt.short(customer.nextVisit)}
                        </span>
                      ) : (
                        <span className="text-ink-soft">{t("noNextVisit")}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {matching > list.length && (
            <div className="mt-4 space-y-2 text-center">
              <p className="text-sm text-ink-soft">{t("partial", { shown: list.length, total: matching })}</p>
              {shown < MAX_SHOWN ? (
                <Link href={moreHref()} className={`${ui.secondaryButton} sm:w-auto`}>
                  {t("showMore")}
                </Link>
              ) : (
                <p className="text-sm text-ink-soft">{t("refineSearch")}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
