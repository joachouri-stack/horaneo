import { getTranslations } from "next-intl/server";
import { DASH_ICONS, DashIcon, StatCard, panel } from "@/components/manager/DashboardWidgets";
import { initials } from "@/components/manager/DayTimeline";
import { ui } from "@/components/ui/styles";
import { CUSTOMER_SEGMENTS } from "@/config/customers";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import {
  CUSTOMER_SEGMENT_KEYS,
  customerDirectory,
  type CustomerSegment,
} from "@/modules/customers/customers";
import { formatPhone } from "@/modules/phone";

/** Fiches affichées d'abord, puis ajoutées à chaque « Afficher plus » (plafond pour le téléphone). */
const PAGE_SIZE = 200;
const MAX_SHOWN = 1000;

/** Couleurs des pastilles d'initiales : fixes pour une même cliente. */
const AVATAR_COLORS = [
  "bg-[#e8ebfa] text-[#3a4bb8]",
  "bg-[#fbe8ee] text-[#b8456b]",
  "bg-[#e3f4ee] text-[#1f7a5f]",
  "bg-[#fdf1e0] text-[#a8661b]",
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
  inactive: "bg-[#fdf3e2] text-[#a8661b]",
} as const;

/** Fichier clientes : chiffres clés, filtres par groupe, recherche et liste détaillée. */
export default async function CustomersPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/clientes">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q : "";
  const segment: CustomerSegment = CUSTOMER_SEGMENT_KEYS.includes(query.groupe as CustomerSegment)
    ? (query.groupe as CustomerSegment)
    : "all";
  const t = await getTranslations("manager.customers");
  const tCommon = await getTranslations("common");
  const now = new Date();
  // Liste affichée par tranches : « Afficher plus » ajoute la tranche suivante.
  const shown = Math.min(Math.max(Number(query.n) || PAGE_SIZE, PAGE_SIZE), MAX_SHOWN);
  const {
    customers: list,
    counts,
    matching,
  } = await page.db((tx) => customerDirectory(tx, page.tenantId, { query: q, segment, now, limit: shown }));

  const moreHref = () => {
    const search = new URLSearchParams();
    if (segment !== "all") search.set("groupe", segment);
    if (q) search.set("q", q);
    search.set("n", String(shown + PAGE_SIZE));
    return `${page.base}/clientes?${search.toString()}`;
  };

  const href = (next: CustomerSegment) => {
    const search = new URLSearchParams();
    if (next !== "all") search.set("groupe", next);
    if (q) search.set("q", q);
    const text = search.toString();
    return `${page.base}/clientes${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {t("title")}
          </h1>
          <p className="mt-1 text-ink-soft">{t("subtitle")}</p>
        </div>
        <Link
          href={`${page.base}/clientes/nouvelle`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-[0.95rem] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_12px_26px_-16px_var(--color-accent)] transition hover:bg-accent-strong"
        >
          <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
          {t("new")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          icon={DASH_ICONS.users}
          tone="indigo"
          label={t("statAll")}
          value={String(counts.all)}
          sub={t("statAllSub", { count: counts.visited })}
        />
        <StatCard
          icon={DASH_ICONS.star}
          tone="violet"
          label={t("statLoyal")}
          value={String(counts.loyal)}
          sub={t("statLoyalSub", { visits: CUSTOMER_SEGMENTS.loyalVisits })}
        />
        <StatCard
          icon={DASH_ICONS.plus}
          tone="green"
          label={t("statNew")}
          value={String(counts.new)}
          sub={t("statNewSub", { days: CUSTOMER_SEGMENTS.newDays })}
        />
        <StatCard
          icon={DASH_ICONS.clock}
          tone="amber"
          label={t("statInactive")}
          value={String(counts.inactive)}
          sub={t("statInactiveSub", { days: CUSTOMER_SEGMENTS.inactiveDays })}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Téléphone : les quatre filtres tiennent sur une ligne, sans défilement. */}
        <nav aria-label={t("filters")} className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-2">
          {CUSTOMER_SEGMENT_KEYS.map((key) => {
            const active = key === segment;
            return (
              <Link
                key={key}
                href={href(key)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-1 text-[0.78rem] font-medium transition sm:shrink-0 sm:gap-2 sm:px-4 sm:text-[0.9rem] ${
                  active
                    ? "border-night bg-night text-white"
                    : "border-hairline bg-white text-night hover:border-accent-line"
                }`}
              >
                {t(`filter.${key}`)}
                <span
                  className={`hidden rounded-full px-1 text-[0.7rem] tabular-nums min-[360px]:inline sm:px-1.5 sm:text-[0.75rem] ${active ? "bg-white/20" : "bg-mist-50 text-ink-soft"}`}
                >
                  {counts[key]}
                </span>
              </Link>
            );
          })}
        </nav>
        <form method="get" role="search" className="flex gap-2 lg:w-96">
          {segment !== "all" && <input type="hidden" name="groupe" value={segment} />}
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

      {list.length === 0 ? (
        <p className={`${panel} text-ink-soft`}>{segment === "all" ? t("empty") : t("emptyFilter")}</p>
      ) : (
        <div className={`${panel} !p-0`}>
          {/* En-têtes du tableau, sur ordinateur seulement. */}
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,2.2fr)_0.8fr_0.9fr_1fr_1fr] gap-4 border-b border-hairline px-6 py-3 text-[0.78rem] font-medium uppercase tracking-[0.06em] text-ink-soft lg:grid"
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
              // Une seule étiquette : à relancer, sinon fidèle, sinon nouvelle.
              const badge = customer.inactive
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
                        className={`flex size-11 shrink-0 items-center justify-center rounded-full text-[0.85rem] font-semibold ${avatarColor(customer.id)}`}
                      >
                        {initials(name)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-medium text-night">{name}</span>
                          {badge && (
                            <span
                              className={`rounded-full px-2 py-px text-[0.72rem] font-medium ${BADGES[badge]}`}
                            >
                              {t(`badge.${badge}`)}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[0.85rem] text-ink-soft">
                          {customer.phone ? formatPhone(customer.phone) : customer.email}
                        </span>
                      </span>
                    </span>

                    {/* Téléphone : résumé sous le nom. */}
                    <span className="col-start-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.8rem] text-ink-soft lg:hidden">
                      <span>
                        {t("visitsCount", { count: customer.visits })}
                        {customer.spentCents > 0 && ` · ${page.fmt.money(customer.spentCents)}`}
                      </span>
                      <span>
                        {customer.nextVisit
                          ? t("nextVisit", { date: page.fmt.short(customer.nextVisit) })
                          : customer.lastVisit
                            ? t("lastVisit", { date: page.fmt.short(customer.lastVisit) })
                            : t("never")}
                      </span>
                    </span>

                    {/* Ordinateur : colonnes. */}
                    <span className="hidden text-night tabular-nums lg:block">{customer.visits}</span>
                    <span className="hidden text-night tabular-nums lg:block">
                      {page.fmt.money(customer.spentCents)}
                    </span>
                    <span className="hidden text-[0.9rem] text-ink-soft lg:block">
                      {customer.lastVisit ? page.fmt.short(customer.lastVisit) : t("never")}
                    </span>
                    <span className="hidden text-[0.9rem] lg:block">
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
