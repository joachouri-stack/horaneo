import { addDays, addMinutes, isoWeekday, localMinutesToUtc, timeToMinutes, utcToLocal } from "./time";

/**
 * Calcul des créneaux disponibles d'une journée (fonction pure, sans base).
 *
 * Un créneau est proposé pour un membre si :
 * - le début est aligné sur l'intervalle (toutes les 15 min par défaut) ;
 * - la prestation tient entière dans les horaires d'ouverture ET les horaires du membre ;
 * - le début est assez tard (délai minimum) et la date pas trop lointaine ;
 * - la prestation ne tombe ni sur une fermeture, ni sur un congé du membre ;
 * - prestation + temps de battement ne chevauchent aucun rendez-vous du membre
 *   (les rendez-vous existants comptent eux aussi leur battement).
 */

export type Interval = { start: Date; end: Date };

export type StaffInput = {
  id: string;
  sortOrder: number;
  schedules: {
    weekday: number;
    startsAt: string;
    endsAt: string;
    validFrom: string | null;
    validUntil: string | null;
  }[];
  /** Rendez-vous actifs : de leur début à la fin de leur battement. */
  appointments: Interval[];
  /** Congés et créneaux bloqués du membre. */
  timeOff: Interval[];
};

export type SlotRules = {
  timezone: string;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
};

export type DaySlotsInput = {
  date: string;
  now: Date;
  rules: SlotRules;
  durationMinutes: number;
  bufferMinutes: number;
  openingHours: { weekday: number; opensAt: string; closesAt: string }[];
  /** Fermetures de tout l'établissement. */
  closures: Interval[];
  staff: StaffInput[];
};

export type Slot = { start: Date; time: string; staffIds: string[] };

type Window = [number, number];

function windowsFor(ranges: { start: string; end: string }[]): Window[] {
  return ranges
    .map((range) => [timeToMinutes(range.start), timeToMinutes(range.end)] as Window)
    .filter(([a, b]) => a < b);
}

function intersect(a: Window[], b: Window[]): Window[] {
  const result: Window[] = [];
  for (const [a1, a2] of a) {
    for (const [b1, b2] of b) {
      const start = Math.max(a1, b1);
      const end = Math.min(a2, b2);
      if (start < end) result.push([start, end]);
    }
  }
  return result;
}

const overlaps = (start: Date, end: Date, intervals: Interval[]) =>
  intervals.some((interval) => start < interval.end && interval.start < end);

/** Le jour est-il réservable (ni passé, ni au-delà du délai maximum) ? */
export function isBookableDate(date: string, now: Date, rules: SlotRules): boolean {
  const today = utcToLocal(now, rules.timezone).date;
  return date >= today && date <= addDays(today, rules.maxAdvanceDays);
}

export function computeDaySlots(input: DaySlotsInput): Slot[] {
  const { date, now, rules } = input;
  if (input.durationMinutes <= 0 || !isBookableDate(date, now, rules)) return [];
  const weekday = isoWeekday(date);
  const earliest = addMinutes(now, rules.minNoticeMinutes);
  const opening = windowsFor(
    input.openingHours
      .filter((range) => range.weekday === weekday)
      .map((range) => ({ start: range.opensAt, end: range.closesAt })),
  );
  if (opening.length === 0) return [];

  const byTime = new Map<number, Slot>();
  for (const member of input.staff) {
    const own = windowsFor(
      member.schedules
        .filter(
          (schedule) =>
            schedule.weekday === weekday &&
            (!schedule.validFrom || schedule.validFrom <= date) &&
            (!schedule.validUntil || date <= schedule.validUntil),
        )
        .map((schedule) => ({ start: schedule.startsAt, end: schedule.endsAt })),
    );
    for (const [windowStart, windowEnd] of intersect(opening, own)) {
      const first = Math.ceil(windowStart / rules.slotIntervalMinutes) * rules.slotIntervalMinutes;
      for (
        let minute = first;
        minute + input.durationMinutes <= windowEnd;
        minute += rules.slotIntervalMinutes
      ) {
        const start = localMinutesToUtc(date, minute, rules.timezone);
        // Heure inexistante (passage à l'heure d'été) : ignorée.
        if (utcToLocal(start, rules.timezone).minutes !== minute) continue;
        if (start < earliest) continue;
        const serviceEnd = addMinutes(start, input.durationMinutes);
        const blockEnd = addMinutes(serviceEnd, input.bufferMinutes);
        if (overlaps(start, serviceEnd, input.closures)) continue;
        if (overlaps(start, serviceEnd, member.timeOff)) continue;
        if (overlaps(start, blockEnd, member.appointments)) continue;
        const slot = byTime.get(minute) ?? {
          start,
          time: utcToLocal(start, rules.timezone).time,
          staffIds: [],
        };
        if (!slot.staffIds.includes(member.id)) slot.staffIds.push(member.id);
        byTime.set(minute, slot);
      }
    }
  }
  return [...byTime.entries()].sort(([a], [b]) => a - b).map(([, slot]) => slot);
}

/**
 * « Sans préférence » : le membre qui a le moins de minutes réservées ce
 * jour-là ; à égalité, l'ordre choisi par l'établissement.
 */
export function chooseLeastLoaded(
  candidateIds: string[],
  staff: { id: string; sortOrder: number }[],
  bookedMinutes: Map<string, number>,
): string | null {
  const candidates = staff.filter((member) => candidateIds.includes(member.id));
  candidates.sort(
    (a, b) =>
      (bookedMinutes.get(a.id) ?? 0) - (bookedMinutes.get(b.id) ?? 0) ||
      a.sortOrder - b.sortOrder ||
      a.id.localeCompare(b.id),
  );
  return candidates[0]?.id ?? null;
}
