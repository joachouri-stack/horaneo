/**
 * Dates et fuseaux horaires sans dépendance externe.
 * - Un jour local s'écrit « AAAA-MM-JJ », une heure locale « HH:MM ».
 * - Les instants sont des Date (heure universelle).
 * Les changements d'heure (été/hiver) sont gérés : 10:00 reste 10:00 à Lyon.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, value);
  }
  return value;
}

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday) + 1,
  };
}

/** Décalage du fuseau à un instant donné, en minutes (Paris l'été : +120). */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Jour et heure locaux → instant universel. Une heure qui n'existe pas (passage à l'heure d'été) est décalée d'autant. */
export function localToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMinutes(new Date(guess), timeZone);
  let result = guess - first * 60000;
  const second = offsetMinutes(new Date(result), timeZone);
  if (second !== first) result = guess - second * 60000;
  return new Date(result);
}

/** Minutes depuis minuit (heure locale) → instant universel. */
export function localMinutesToUtc(date: string, minutes: number, timeZone: string): Date {
  return localToUtc(date, minutesToTime(minutes), timeZone);
}

/** Instant universel → jour, heure et jour de semaine locaux. */
export function utcToLocal(instant: Date, timeZone: string) {
  const p = localParts(instant, timeZone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
    minutes: p.hour * 60 + p.minute,
    weekday: p.weekday,
  };
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Calendrier pur (sans fuseau) : AAAA-MM-JJ + n jours. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Calendrier pur : premier jour du mois de la date, décalé de n mois (AAAA-MM-01). */
export function addMonths(date: string, months: number): string {
  const [year, month] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-01`;
}

/** Jour de la semaine d'une date (1 = lundi … 7 = dimanche). */
export function isoWeekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
}

export const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60000);
}
