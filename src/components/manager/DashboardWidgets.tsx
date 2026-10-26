import type { ReactNode } from "react";

/**
 * Briques du tableau de bord de la gérante : cartes de chiffres, histogramme,
 * anneau de répartition et barre « en ligne / en salon ». Dessinées en HTML et
 * SVG (aucune bibliothèque), lisibles au lecteur d'écran par leur texte.
 */

export const DASH_ICONS = {
  calendar: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
  euro: "M17 6.5A7 7 0 1 0 17 17.5M4 10.5h9M4 13.5h9",
  users:
    "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 19v-1a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  star: "m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13.5 6.5 19 12l-5.5 5.5",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
} as const;

export function DashIcon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const panel =
  "rounded-[1.4rem] border border-hairline bg-white p-5 shadow-[0_1px_2px_rgba(15,24,48,.04)] sm:p-6";

/** Pastille d'évolution : +12 % (vert) ou −5 % (rouge), avec son texte complet pour le lecteur d'écran. */
export function Trend({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[0.75rem] font-medium tabular-nums ${
        up ? "bg-[#e7f6ee] text-[#1e7a4c]" : "bg-[#fdecea] text-[#b4372a]"
      }`}
    >
      <span aria-hidden="true">{up ? "↑" : "↓"}</span>
      <span aria-hidden="true">{Math.abs(value)} %</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

const TONES = {
  indigo: "bg-[#eef0fb] text-[#3a4bb8]",
  green: "bg-[#e7f6ee] text-[#1e7a4c]",
  violet: "bg-[#f1ecfb] text-[#6a45b8]",
  amber: "bg-[#fdf3e2] text-[#a8661b]",
  teal: "bg-[#e5f2f2] text-[#0e6a73]",
} as const;

export function StatCard({
  icon,
  tone,
  label,
  value,
  sub,
  trend,
}: {
  icon: string;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  sub?: ReactNode;
  trend?: ReactNode;
}) {
  return (
    <div className={`${panel} flex min-w-0 flex-col gap-3 !p-4 sm:flex-row sm:gap-4 sm:!p-5`}>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 ${TONES[tone]}`}
      >
        <DashIcon d={icon} className="h-[22px] w-[22px]" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[0.85rem] text-ink-soft">{label}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-display text-[1.35rem] font-semibold leading-none tracking-[-0.02em] text-night tabular-nums sm:text-[1.6rem]">
            {value}
          </span>
          {trend}
        </p>
        {sub && <p className="mt-1.5 line-clamp-2 text-[0.8rem] leading-snug text-ink-soft">{sub}</p>}
      </div>
    </div>
  );
}

/** Histogramme des 7 derniers jours : aujourd'hui en couleur pleine, valeur au survol et pour le lecteur d'écran. */
export function RevenueBars({
  days,
}: {
  days: { label: string; value: string; cents: number; today: boolean }[];
}) {
  const max = Math.max(1, ...days.map((day) => day.cents));
  return (
    <ul className="mt-5 grid h-40 grid-cols-7 items-end gap-2 sm:gap-3">
      {days.map((day) => (
        <li key={day.label} className="group flex h-full flex-col items-center justify-end gap-2">
          <span className="sr-only">
            {day.label} : {day.value}
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none whitespace-nowrap rounded-md bg-night px-1.5 py-0.5 text-[0.7rem] text-white opacity-0 transition group-hover:opacity-100"
          >
            {day.value}
          </span>
          <span
            aria-hidden="true"
            className={`w-full max-w-9 rounded-lg transition-[height] duration-500 ${
              day.today ? "bg-accent" : "bg-accent/20 group-hover:bg-accent/35"
            }`}
            style={{ height: `${Math.max(4, (day.cents / max) * 100)}%` }}
          />
          <span
            aria-hidden="true"
            className={`text-[0.72rem] first-letter:uppercase ${day.today ? "font-medium text-accent" : "text-ink-soft"}`}
          >
            {day.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

const DONUT_COLORS = ["#3a4bb8", "#e2708f", "#f0b25b", "#2fa58b", "#8a7be0", "#c3c9d8"];

/** Anneau de répartition (prestations du mois) avec le total au centre et la légende en pourcentages. */
export function Donut({
  items,
  total,
  centerLabel,
}: {
  items: { label: string; value: number; color?: string | null }[];
  total: number;
  centerLabel: string;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const lengths = items.map((item) => (total ? (item.value / total) * circumference : 0));
  const offsets = lengths.map((_, index) => lengths.slice(0, index).reduce((sum, length) => sum + length, 0));
  return (
    <div className="mt-4 flex flex-col items-center gap-5">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#eef1f6" strokeWidth="11" />
          {items.map((item, index) => (
            <circle
              key={item.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={item.color ?? DONUT_COLORS[index % DONUT_COLORS.length]}
              strokeWidth="11"
              strokeDasharray={`${Math.max(lengths[index] - 1.5, 0)} ${circumference}`}
              strokeDashoffset={-offsets[index]}
              strokeLinecap="round"
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-[1.7rem] font-semibold leading-none text-night tabular-nums">
            {total}
          </span>
          <span className="mt-1 text-[0.72rem] text-ink-soft">{centerLabel}</span>
        </span>
      </div>
      <ul className="w-full min-w-0 space-y-2 text-[0.85rem]">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color ?? DONUT_COLORS[index % DONUT_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink">{item.label}</span>
            <span className="tabular-nums text-ink-soft">
              {total ? Math.round((item.value / total) * 100) : 0} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barre de partage en deux (réservé en ligne / ajouté en salon). */
export function SplitBar({
  left,
  right,
}: {
  left: { label: string; value: number };
  right: { label: string; value: number };
}) {
  const total = left.value + right.value;
  const share = total ? Math.round((left.value / total) * 100) : 0;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#eef1f6]" aria-hidden="true">
        <span className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-[0.85rem]">
        <div>
          <dt className="flex items-center gap-2 text-ink-soft">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
            {left.label}
          </dt>
          <dd className="mt-0.5 font-display text-xl font-semibold text-night tabular-nums">
            {share} % <span className="text-sm font-normal text-ink-soft">({left.value})</span>
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-ink-soft">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[#c3c9d8]" />
            {right.label}
          </dt>
          <dd className="mt-0.5 font-display text-xl font-semibold text-night tabular-nums">
            {total ? 100 - share : 0} %{" "}
            <span className="text-sm font-normal text-ink-soft">({right.value})</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
