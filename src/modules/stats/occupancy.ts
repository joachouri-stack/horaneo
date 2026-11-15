import { schedulesOn, type Interval, type StaffInput } from "@/modules/booking/slots";
import { addDays, isoWeekday, localToUtc } from "@/modules/booking/time";

/**
 * Taux de remplissage (fonctions pures, sans base) : minutes réservées ÷ minutes de
 * travail disponibles. Les horaires sont exprimés dans le fuseau de l'établissement,
 * les congés et rendez-vous sont des instants (heure universelle).
 */

/** Intervalles triés et fusionnés (ceux qui se chevauchent ou se touchent n'en font plus qu'un). */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const result: Interval[] = [];
  for (const interval of sorted) {
    const last = result[result.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end;
    } else {
      result.push({ start: interval.start, end: interval.end });
    }
  }
  return result;
}

/** Intervalles de base privés des périodes retirées (congés, fermetures). */
export function subtractIntervals(base: Interval[], cuts: Interval[]): Interval[] {
  const removed = mergeIntervals(cuts);
  const result: Interval[] = [];
  for (const interval of mergeIntervals(base)) {
    let cursor = interval.start;
    for (const cut of removed) {
      if (cut.end <= cursor || cut.start >= interval.end) continue;
      if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
      if (cut.end > cursor) cursor = cut.end;
      if (cursor >= interval.end) break;
    }
    if (cursor < interval.end) result.push({ start: cursor, end: interval.end });
  }
  return result;
}

/** Durée totale d'intervalles, en minutes (les chevauchements ne comptent qu'une fois). */
export function intervalMinutes(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce(
    (sum, interval) => sum + (interval.end.getTime() - interval.start.getTime()) / 60_000,
    0,
  );
}

export type WorkHours = {
  timezone: string;
  /** Horaires du membre ; s'il n'en a aucun, les horaires d'ouverture de l'établissement servent. */
  schedules: StaffInput["schedules"];
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
};

/** Périodes de travail prévues d'un membre un jour donné (instants universels). */
export function workIntervalsOn(date: string, hours: WorkHours): Interval[] {
  const ranges =
    hours.schedules.length > 0
      ? schedulesOn(hours.schedules, date).map((schedule) => [schedule.startsAt, schedule.endsAt])
      : hours.openingHours
          .filter((range) => range.weekday === isoWeekday(date))
          .map((range) => [range.opensAt, range.closesAt]);
  return mergeIntervals(
    ranges.map(([start, end]) => ({
      start: localToUtc(date, start, hours.timezone),
      end: localToUtc(date, end, hours.timezone),
    })),
  );
}

/**
 * Minutes de travail disponibles d'un membre sur des jours consécutifs : ses horaires
 * (ou ceux de l'établissement), moins les congés qui les chevauchent (les siens et les
 * fermetures de tout l'établissement, à passer ensemble dans `timeOff`).
 */
export function availableMinutes(
  input: WorkHours & { firstDate: string; days: number; timeOff: Interval[] },
): number {
  const off = mergeIntervals(input.timeOff);
  let total = 0;
  for (let index = 0; index < input.days; index += 1) {
    total += intervalMinutes(subtractIntervals(workIntervalsOn(addDays(input.firstDate, index), input), off));
  }
  return Math.round(total);
}

/** Taux de remplissage (0,85 = 85 %) ; null quand aucune minute n'est disponible. */
export function fillRate(bookedMinutes: number, available: number): number | null {
  return available > 0 ? bookedMinutes / available : null;
}
