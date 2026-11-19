"use client";

import { useRouter } from "@/i18n/navigation";

type Option = { value: string; label: string; href: string };

/**
 * Deux petits menus côte à côte au-dessus de la liste des clients : le groupe affiché
 * (avec le nombre de clients) et l'ordre de la liste. Un choix ouvre la liste filtrée.
 */
export function CustomerListControls({
  showLabel,
  sortLabel,
  groups,
  sorts,
  group,
  sort,
}: {
  showLabel: string;
  sortLabel: string;
  groups: Option[];
  sorts: Option[];
  group: string;
  sort: string;
}) {
  const router = useRouter();
  const go = (options: Option[], value: string) => {
    const target = options.find((option) => option.value === value);
    if (target) router.push(target.href);
  };
  const select =
    "min-h-11 w-full min-w-0 rounded-xl border border-hairline bg-white px-3 text-[0.9375rem] font-medium text-night focus:border-accent focus:outline-none";
  return (
    <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
      <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="text-sm text-ink-soft">{showLabel}</span>
        <select
          value={group}
          onChange={(event) => go(groups, event.target.value)}
          className={`${select} sm:w-auto`}
        >
          {groups.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="text-sm text-ink-soft">{sortLabel}</span>
        <select
          value={sort}
          onChange={(event) => go(sorts, event.target.value)}
          className={`${select} sm:w-auto`}
        >
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
