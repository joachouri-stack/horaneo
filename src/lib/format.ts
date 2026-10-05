/** Mises en forme selon la langue (montants, dates). */

/** Montant sans centimes inutiles : « 36 € », mais « 45,50 € ». */
export function formatMoney(cents: number, currency: string, locale: string): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
}

/** Montant en centimes → texte à modifier dans un champ (« 45,50 »). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
}

export function formatDate(
  date: Date | string | null | undefined,
  locale: string,
  timeZone = "Europe/Paris",
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone }).format(new Date(date));
}

export function formatDateTime(
  date: Date | string | null | undefined,
  locale: string,
  timeZone = "Europe/Paris",
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
    new Date(date),
  );
}
