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

/**
 * Montant découpé pour l'affichage des prix : la partie entière (« 19 ») et
 * le reste (« ,99 € »), même format que formatMoney.
 */
export function moneyParts(cents: number, currency: string, locale: string): { lead: string; tail: string } {
  const whole = cents % 100 === 0;
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).formatToParts(cents / 100);
  const last = parts.findLastIndex((part) => part.type === "integer");
  const join = (list: Intl.NumberFormatPart[]) => list.map((part) => part.value).join("");
  return { lead: join(parts.slice(0, last + 1)), tail: join(parts.slice(last + 1)) };
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

/**
 * Formateur de dates qui suit l'usage français pour le premier du mois :
 * « dimanche 1er novembre » plutôt que « dimanche 1 novembre ».
 */
export function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const format = new Intl.DateTimeFormat(locale, options);
  const firstOfMonth = locale.startsWith("fr") && options.day === "numeric" && options.month === "long";
  return (value: Date) =>
    firstOfMonth
      ? format
          .formatToParts(value)
          .map((part) => (part.type === "day" && part.value === "1" ? "1er" : part.value))
          .join("")
      : format.format(value);
}
