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
