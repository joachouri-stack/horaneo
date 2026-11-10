import { getTranslations } from "next-intl/server";
import type { PlanFeatures, PlanLimits } from "@/db/schema";
import { Link } from "@/i18n/navigation";
import { gridComparison, SOLUTIONS, type Solution } from "@/modules/billing/grid";
import { CATEGORY_ICONS } from "./Comparison";
import { ArrowLine, CheckLine } from "./line-icons";

type FeaturePlan = { code: string; features: PlanFeatures; limits: PlanLimits };

/**
 * « Voir toutes les fonctionnalités » : la liste complète, rangée par thème, repliée par
 * défaut (pas de JavaScript : details / summary). Même catalogue que le comparatif des packs
 * (lignes incluses dans au moins un pack) ; les lignes propres à une solution suivent la
 * solution choisie ([data-only]) ; rien des solutions masquées. Fonctions annoncées : « Bientôt ».
 */
export async function AllFeatures({
  plans,
  soon,
  shown,
}: {
  plans: FeaturePlan[];
  soon: string[];
  /** Solutions présentées sur la page : rien des autres (masquées dans les réglages). */
  shown: readonly Solution[];
}) {
  const [t, tGrid, tPlans] = await Promise.all([
    getTranslations("home.benefits.all"),
    getTranslations("home.grid"),
    getTranslations("home.plans"),
  ]);
  const hidden = new Set<string>(SOLUTIONS.filter((code) => !shown.includes(code)));
  const groups = gridComparison(plans, new Set(soon))
    .filter((group) => !hidden.has(group.category))
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => !row.solution || !hidden.has(row.solution)),
    }))
    .filter((group) => group.rows.length > 0);
  if (groups.length === 0) return null;

  return (
    <details className="group mt-8 lg:mt-10">
      <summary className="mx-auto flex min-h-12 w-fit cursor-pointer list-none items-center gap-2 rounded-full border border-[#d9cffd] bg-white px-6 font-medium text-violet shadow-[0_10px_24px_-16px_rgba(123,63,228,.6)] transition hover:border-violet/50 hover:bg-[#f7f4ff] [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{t("show")}</span>
        <span className="hidden group-open:inline">{t("hide")}</span>
        <ArrowLine className="size-4 rotate-90 transition-transform duration-300 group-open:-rotate-90 motion-reduce:transition-none" />
      </summary>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const Icon = CATEGORY_ICONS[group.category];
          const solutions = new Set(group.rows.map((row) => row.solution));
          const only = solutions.size === 1 ? [...solutions][0] : null;
          return (
            <section
              key={group.category}
              data-only={only ?? undefined}
              aria-label={tGrid(`categories.${group.category}`)}
              className="rounded-2xl border border-hairline bg-white p-5 shadow-[0_1px_2px_rgba(15,24,48,.04)]"
            >
              <h3 className="flex items-center gap-3 font-display text-mk-body font-semibold text-night">
                <span className="flex size-9 flex-none items-center justify-center rounded-xl bg-[#efeaff] text-violet">
                  <Icon className="size-5" />
                </span>
                {tGrid(`categories.${group.category}`)}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {group.rows.map((row) => (
                  <li
                    key={row.key}
                    data-only={row.solution ?? undefined}
                    className="flex items-start gap-2.5 text-mk-small leading-snug text-[#2d3446]"
                  >
                    <CheckLine className="mt-0.5 size-4 flex-none text-violet" />
                    <span>
                      {tGrid(`rows.${row.key}.label` as "rows.photos.label")}
                      {row.soon && (
                        <span className="ml-2 inline-block rounded-full bg-mist-50 px-2 py-px align-[1px] text-mk-note text-ink-soft">
                          {tPlans("soonTag")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-center">
        <Link
          href="/comparatif"
          className="inline-flex min-h-11 items-center gap-1.5 font-medium text-violet underline-offset-4 hover:underline"
        >
          {t("compare")}
          <ArrowLine className="size-4" />
        </Link>
      </p>
    </details>
  );
}
