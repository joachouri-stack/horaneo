/**
 * Anniversaire d'une cliente : jour et mois seulement, jamais l'année
 * (minimisation des données). Fonctions sans accès à la base ni dépendance :
 * utilisables par les formulaires (navigateur) comme par les règles métier.
 */

export const BIRTH_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Nombre de jours possibles dans un mois de naissance (29 en février : années bissextiles). */
export function daysInBirthMonth(month: number) {
  if (month === 2) return 29;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidBirthday(month: number, day: number) {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInBirthMonth(month)
  );
}

/** « 14 mars » dans la langue donnée (aucune année affichée). */
export function formatBirthday(month: number, day: number, locale: string) {
  // Année bissextile fixe : le 29 février existe.
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, month - 1, day)),
  );
}

/** Noms des mois (« janvier »…) pour les listes de choix. */
export function birthMonthNames(locale: string) {
  const format = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  return BIRTH_MONTHS.map((month) => ({
    month,
    name: format.format(new Date(Date.UTC(2000, month - 1, 1))),
  }));
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Anniversaires fêtés à une date locale (« 2027-02-28 ») : le jour même et, les
 * années non bissextiles, le 28 février fête aussi les clientes nées un 29 février.
 */
export function birthdaysCelebratedOn(localDate: string): { month: number; day: number }[] {
  const [year, month, day] = localDate.split("-").map(Number);
  const list = [{ month, day }];
  if (month === 2 && day === 28 && !isLeapYear(year)) list.push({ month: 2, day: 29 });
  return list;
}
