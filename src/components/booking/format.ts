/** Mises en forme du parcours de réservation (dans le fuseau de l'établissement). */

export function formatLongDate(iso: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone }).format(
    new Date(iso),
  );
}

export function formatTimeOf(iso: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(
    new Date(iso),
  );
}

/** Jour « AAAA-MM-JJ » → { court : « mar. », numéro : « 6 », mois : « oct. » }. */
export function dayChip(date: string, locale: string) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(value);
  return {
    weekday: format({ weekday: "short" }),
    day: format({ day: "numeric" }),
    month: format({ month: "short" }),
    full: format({ weekday: "long", day: "numeric", month: "long" }),
  };
}

export function money(cents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
