/**
 * Graphiques des statistiques de la gérante : courbes lissées (SVG), anneaux de
 * progression vers les objectifs, carte de chaleur des heures. Sans
 * bibliothèque ; chaque graphique porte aussi son contenu en texte pour le
 * lecteur d'écran.
 */

type Series = { label: string; color: string; values: number[] };

/** Courbe lissée passant par les points (Catmull-Rom converti en courbes de Bézier). */
function smoothPath(points: [number, number][]) {
  if (points.length === 0) return "";
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index - 1] ?? points[index];
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const [x3, y3] = points[index + 2] ?? points[index + 1];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    path += ` C ${c1x} ${Math.max(c1y, 0)} ${c2x} ${Math.max(c2y, 0)} ${x2} ${y2}`;
  }
  return path;
}

/**
 * Taille des libellés des axes, en unités du dessin (720 de large) : le dessin rapetisse
 * sur téléphone, les libellés gardent environ 13 px à l'écran.
 */
const AXIS_TEXT = "text-[30px] sm:text-[18px] lg:text-[14px]";

/** Arrondi « joli » du maximum de l'axe : divisible en 4 graduations rondes (4, 8, 12, 20, 40, 100…). */
function niceMax(value: number) {
  const small = [4, 8, 12, 20, 40];
  const found = small.find((candidate) => candidate >= value);
  if (found) return found;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 4, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

export function LineChart({
  id,
  series,
  labels,
  format = (value: number) => String(value),
  summary,
}: {
  id: string;
  series: Series[];
  /** Libellé de chaque point (jour du mois…). */
  labels: string[];
  format?: (value: number) => string;
  summary: string;
}) {
  const width = 720;
  const height = 300;
  // Marges larges : sur téléphone le dessin est réduit de moitié, les libellés restent lisibles.
  const pad = { top: 20, right: 16, bottom: 48, left: 124 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((item) => item.values)));
  const x = (index: number) =>
    pad.left + (labels.length > 1 ? (index / (labels.length - 1)) * innerW : innerW / 2);
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * max);
  const every = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <figure className="mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={summary}>
        <defs>
          {series.map((item, index) => (
            <linearGradient key={item.label} id={`${id}-fill-${index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={index === 0 ? 0.22 : 0.12} />
              <stop offset="100%" stopColor={item.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="#e6e9f0"
              strokeDasharray={tick === 0 ? undefined : "3 4"}
            />
            <text x={pad.left - 10} y={y(tick) + 6} textAnchor="end" className={AXIS_TEXT} fill="#5b6275">
              {format(tick)}
            </text>
          </g>
        ))}
        {labels.map((label, index) =>
          index % every === 0 || index === labels.length - 1 ? (
            <text
              key={label}
              x={x(index)}
              y={height - 12}
              textAnchor="middle"
              className={AXIS_TEXT}
              fill="#5b6275"
            >
              {label}
            </text>
          ) : null,
        )}
        {series.map((item, index) => {
          const points = item.values.map((value, position) => [x(position), y(value)] as [number, number]);
          const line = smoothPath(points);
          return (
            <g key={item.label}>
              <path
                d={`${line} L ${x(item.values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
                fill={`url(#${id}-fill-${index})`}
              />
              <path d={line} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" />
              {item.values.map((value, position) =>
                value > 0 ? (
                  <circle
                    key={position}
                    cx={x(position)}
                    cy={y(value)}
                    r="3"
                    fill="#fff"
                    stroke={item.color}
                    strokeWidth="2"
                  >
                    <title>{`${labels[position]} · ${item.label} : ${format(value)}`}</title>
                  </circle>
                ) : null,
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-1 w-5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Anneau de progression vers un objectif : pourcentage au centre, valeur et reste en dessous. */
export function GoalRing({
  label,
  value,
  goal,
  color,
  valueText,
  goalText,
  remainingText,
}: {
  label: string;
  value: number;
  goal: number;
  color: string;
  valueText: string;
  goalText: string;
  remainingText: string;
}) {
  const ratio = goal > 0 ? value / goal : 0;
  const percent = Math.round(ratio * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(ratio, 1) * circumference;
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative size-24 sm:size-32">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#eef1f6" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${shown} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-[1.15rem] font-semibold leading-none text-night tabular-nums sm:text-[1.6rem]">
            {percent} %
          </span>
          {ratio >= 1 && (
            <span className="mt-1 rounded-full bg-[#e7f6ee] px-2 py-px text-[0.8125rem] font-medium text-[#1e7a4c]">
              ✓
            </span>
          )}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium leading-tight text-night sm:text-base">{label}</p>
      <p className="text-sm text-ink-soft sm:text-sm">
        <span className="font-medium text-night tabular-nums">{valueText}</span> / {goalText}
      </p>
      <p className="mt-0.5 hidden text-sm text-ink-soft sm:block">{remainingText}</p>
    </div>
  );
}

/** Heures les plus demandées : une case par heure, plus foncée quand elle est chargée. */
export function HourHeat({
  hours,
  from,
  to,
  label,
}: {
  hours: number[];
  from: number;
  to: number;
  label: (hour: number, count: number) => string;
}) {
  const slice = hours.slice(from, to);
  const max = Math.max(1, ...slice);
  return (
    <ul
      className="mt-4 grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${slice.length}, minmax(0, 1fr))` }}
    >
      {slice.map((count, index) => {
        const hour = from + index;
        return (
          <li key={hour} className="flex flex-col items-center gap-1.5">
            <span className="sr-only">{label(hour, count)}</span>
            <span
              aria-hidden="true"
              title={label(hour, count)}
              className="h-12 w-full rounded-lg"
              style={{
                backgroundColor: `color-mix(in srgb, #3a4bb8 ${Math.round(8 + (count / max) * 82)}%, white)`,
              }}
            />
            <span aria-hidden="true" className="text-[0.8125rem] text-ink-soft tabular-nums">
              {hour}h
            </span>
          </li>
        );
      })}
    </ul>
  );
}
