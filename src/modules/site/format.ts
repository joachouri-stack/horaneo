/** Mises en forme propres aux sites clients. */

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** 45 → « 45 min » ; 90 → « 1 h 30 » ; 120 → « 2 h ». */
export function formatDuration(t: Translate, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t("durationMinutes", { minutes });
  if (rest === 0) return t("durationHours", { hours });
  return t("durationHoursMinutes", { hours, minutes: String(rest).padStart(2, "0") });
}

/** Jour de la semaine (1 = lundi … 7 = dimanche) dans le fuseau de l'établissement. */
export function isoWeekdayIn(timeZone: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name) + 1;
}

/** « 09:00 » → « 9 h » ou « 9:00 » selon la langue. */
export function formatTime(time: string, locale: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

/** Heure à la française « 9 h » / « 9 h 30 » ; ailleurs, le format de la langue. */
export function formatClock(time: string, locale: string): string {
  if (!locale.startsWith("fr")) return formatTime(time, locale);
  const [h, m] = time.split(":").map(Number);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

/** Lien d'itinéraire (ouvre l'application de cartes du téléphone). */
export function directionsUrl(parts: (string | null | undefined)[]): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.filter(Boolean).join(", "))}`;
}

/** Carte OpenStreetMap intégrable (sans cookie publicitaire), si l'adresse a des coordonnées. */
export function osmEmbedUrl(latitude: number, longitude: number): string {
  const d = 0.006;
  const bbox = [longitude - d, latitude - d / 2, longitude + d, latitude + d / 2]
    .map((n) => n.toFixed(5))
    .join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

type HourRange = { weekday: number; opensAt: string; closesAt: string };

/**
 * Horaires résumés par groupes de jours consécutifs identiques :
 * [{ from: 1, to: 5, ranges: [...] }, { from: 6, to: 6, ranges: [...] }, { from: 7, to: 7, ranges: [] }].
 */
export function groupHours(hours: HourRange[]) {
  const key = (day: number) =>
    hours
      .filter((range) => range.weekday === day)
      .map((range) => `${range.opensAt}-${range.closesAt}`)
      .join(",");
  const groups: { from: number; to: number; ranges: HourRange[] }[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const last = groups.at(-1);
    if (last && key(last.to) === key(day)) last.to = day;
    else groups.push({ from: day, to: day, ranges: hours.filter((range) => range.weekday === day) });
  }
  return groups;
}

/** Premier et dernier jour d'ouverture s'ils se suivent (ex. lundi → samedi), sinon null. */
export function openDaysSpan(hours: HourRange[]) {
  const days = [...new Set(hours.map((range) => range.weekday))].sort();
  if (days.length < 2) return null;
  const contiguous = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  return contiguous ? { from: days[0], to: days.at(-1)! } : null;
}

export type HoursRow =
  | { from: number; to: number; kind: "ranges"; ranges: HourRange[] }
  | { from: number; to: number; kind: "opensLater"; opensAt: string }
  | { from: number; to: number; kind: "closed" };

/**
 * Horaires résumés comme on les écrit à la main : « Lundi au vendredi 9 h à 19 h »,
 * puis l'exception « Jeudi dès 9 h 30 » (même fermeture, ouverture plus tardive),
 * puis les autres jours.
 */
export function summarizeHours(hours: HourRange[]): HoursRow[] {
  const dayRanges = (day: number) => hours.filter((range) => range.weekday === day);
  const single = [1, 2, 3, 4, 5, 6, 7].filter((day) => dayRanges(day).length === 1);
  const counts = new Map<string, number>();
  for (const day of single) {
    const [range] = dayRanges(day);
    const key = `${range.opensAt}-${range.closesAt}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [modeKey, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const fallback = (): HoursRow[] =>
    groupHours(hours).map((group) =>
      group.ranges.length === 0
        ? { from: group.from, to: group.to, kind: "closed" }
        : { from: group.from, to: group.to, kind: "ranges", ranges: group.ranges },
    );
  if (modeCount < 3) return fallback();
  const [modeOpens, modeCloses] = modeKey.split("-");
  const fits = (day: number) => {
    const ranges = dayRanges(day);
    return ranges.length === 1 && ranges[0].closesAt === modeCloses && ranges[0].opensAt >= modeOpens;
  };
  // Plus longue suite de jours qui suivent l'horaire principal (avec ouvertures plus tardives).
  let best = { from: 0, to: -1 };
  for (let start = 1; start <= 7; start += 1) {
    let end = start - 1;
    while (end + 1 <= 7 && fits(end + 1)) end += 1;
    if (end - start > best.to - best.from) best = { from: start, to: end };
  }
  if (best.to - best.from < 2) return fallback();
  const mode = { weekday: 0, opensAt: modeOpens, closesAt: modeCloses };
  const rows: HoursRow[] = [{ from: best.from, to: best.to, kind: "ranges", ranges: [mode] }];
  for (let day = best.from; day <= best.to; day += 1) {
    const [range] = dayRanges(day);
    if (range.opensAt !== modeOpens)
      rows.push({ from: day, to: day, kind: "opensLater", opensAt: range.opensAt });
  }
  // Autres jours, regroupés seulement s'ils se suivent et ont les mêmes horaires.
  const key = (day: number) =>
    dayRanges(day)
      .map((range) => `${range.opensAt}-${range.closesAt}`)
      .join(",");
  let pending: { from: number; to: number } | null = null;
  const flush = () => {
    if (!pending) return;
    const ranges = dayRanges(pending.from);
    rows.push(ranges.length === 0 ? { ...pending, kind: "closed" } : { ...pending, kind: "ranges", ranges });
    pending = null;
  };
  for (let day = 1; day <= 7; day += 1) {
    if (day >= best.from && day <= best.to) {
      flush();
      continue;
    }
    if (pending && pending.to === day - 1 && key(pending.from) === key(day)) pending.to = day;
    else {
      flush();
      pending = { from: day, to: day };
    }
  }
  flush();
  // Dans l'ordre de la semaine ; les exceptions juste après la ligne principale.
  const order = (row: HoursRow) => (row.kind === "opensLater" ? best.from + 0.5 : row.from);
  return rows.sort((a, b) => order(a) - order(b));
}
