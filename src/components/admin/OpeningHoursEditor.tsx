"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/actions/result";
import { ActionForm } from "./ActionForm";
import { Hidden } from "./fields";

type Range = { weekday: number; opensAt: string; closesAt: string };

/** Horaires d'ouverture : une ou plusieurs plages par jour, ou fermé. */
export function OpeningHoursEditor({
  tenantId,
  initial,
  action,
  extra,
}: {
  tenantId: string;
  initial: Range[];
  action: (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
  /** Champs cachés supplémentaires (ex. identifiant du membre). */
  extra?: Record<string, string>;
}) {
  const t = useTranslations("admin.tenant.hours");
  const tDays = useTranslations("weekdays");
  const tCommon = useTranslations("common");
  const [ranges, setRanges] = useState<(Range & { key: number })[]>(
    initial.map((range, key) => ({ ...range, key })),
  );
  const [nextKey, setNextKey] = useState(initial.length);

  const update = (key: number, patch: Partial<Range>) =>
    setRanges((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <ActionForm action={action} submitLabel={tCommon("save")}>
      <Hidden values={{ tenantId, ...extra }} />
      <p className="text-sm text-ink/70">{t("hint")}</p>
      <ul className="divide-y divide-navy/10">
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const dayRanges = ranges.filter((range) => range.weekday === day);
          return (
            <li key={day} className="grid gap-2 py-3 sm:grid-cols-[8rem_1fr] sm:items-start">
              <span className="pt-3 font-semibold text-navy">{tDays(String(day) as "1")}</span>
              <div className="space-y-2">
                {dayRanges.length === 0 && <p className="pt-3 text-ink/60">{t("closed")}</p>}
                {dayRanges.map((range) => (
                  <div
                    key={range.key}
                    className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1 sm:gap-2"
                  >
                    <input type="hidden" name="range" value={`${day}|${range.opensAt}|${range.closesAt}`} />
                    <input
                      type="time"
                      aria-label={`${tDays(String(day) as "1")} — ${t("opens")}`}
                      value={range.opensAt}
                      onChange={(e) => update(range.key, { opensAt: e.target.value })}
                      className={`${ui.input} w-full min-w-0 px-2 text-base`}
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      type="time"
                      aria-label={`${tDays(String(day) as "1")} — ${t("closes")}`}
                      value={range.closesAt}
                      onChange={(e) => update(range.key, { closesAt: e.target.value })}
                      className={`${ui.input} w-full min-w-0 px-2 text-base`}
                    />
                    <button
                      type="button"
                      onClick={() => setRanges((all) => all.filter((r) => r.key !== range.key))}
                      aria-label={t("removeRange")}
                      title={t("removeRange")}
                      className="flex h-12 w-10 items-center justify-center rounded-full text-xl font-bold text-coral-dark hover:bg-coral/10"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const last = dayRanges.at(-1);
                    if (!last) {
                      setRanges((all) => [
                        ...all,
                        { key: nextKey, weekday: day, opensAt: "09:00", closesAt: "18:00" },
                      ]);
                    } else if (last.closesAt > "13:00" && last.opensAt < "12:00") {
                      // Deuxième plage = pause déjeuner : 9:00-12:00 puis 14:00-(ancienne fin).
                      setRanges((all) => [
                        ...all.map((r) => (r.key === last.key ? { ...r, closesAt: "12:00" } : r)),
                        { key: nextKey, weekday: day, opensAt: "14:00", closesAt: last.closesAt },
                      ]);
                    } else {
                      const start = last.closesAt < "22:00" ? last.closesAt : "22:00";
                      setRanges((all) => [
                        ...all,
                        { key: nextKey, weekday: day, opensAt: start, closesAt: "23:00" },
                      ]);
                    }
                    setNextKey(nextKey + 1);
                  }}
                  className="text-sm font-semibold text-navy underline"
                >
                  + {t("addRange")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </ActionForm>
  );
}
