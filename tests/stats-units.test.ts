import { describe, expect, it } from "vitest";
import { localToUtc } from "@/modules/booking/time";
import { lineMargin, salesBreakdown } from "@/modules/stats/margins";
import {
  availableMinutes,
  fillRate,
  intervalMinutes,
  mergeIntervals,
  subtractIntervals,
  workIntervalsOn,
} from "@/modules/stats/occupancy";

const TZ = "Europe/Paris";
const at = (time: string, date = "2026-10-06") => localToUtc(date, time, TZ);
const span = (from: string, to: string, date?: string) => ({ start: at(from, date), end: at(to, date) });
const OPENING = [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]; // mardi

describe("remplissage : intervalles", () => {
  it("fusionne les intervalles qui se chevauchent ou se touchent", () => {
    expect(mergeIntervals([span("14:00", "16:00"), span("09:00", "12:00"), span("11:00", "13:00")])).toEqual([
      span("09:00", "13:00"),
      span("14:00", "16:00"),
    ]);
    expect(mergeIntervals([span("09:00", "10:00"), span("10:00", "11:00")])).toEqual([
      span("09:00", "11:00"),
    ]);
    expect(intervalMinutes([span("09:00", "12:00"), span("11:00", "13:00")])).toBe(240);
  });

  it("retire les congés qui chevauchent le début, le milieu ou la fin", () => {
    const base = [span("09:00", "18:00")];
    expect(subtractIntervals(base, [span("08:00", "10:00")])).toEqual([span("10:00", "18:00")]);
    expect(subtractIntervals(base, [span("12:00", "13:00"), span("12:30", "14:00")])).toEqual([
      span("09:00", "12:00"),
      span("14:00", "18:00"),
    ]);
    expect(subtractIntervals(base, [span("17:00", "20:00")])).toEqual([span("09:00", "17:00")]);
    expect(subtractIntervals(base, [span("07:00", "20:00")])).toEqual([]);
    // Congé un autre jour : sans effet.
    expect(subtractIntervals(base, [span("09:00", "18:00", "2026-10-07")])).toEqual(base);
  });
});

describe("remplissage : horaires disponibles", () => {
  const schedule = (
    weekday: number,
    startsAt: string,
    endsAt: string,
    validFrom = null,
    validUntil = null,
  ) => ({
    weekday,
    startsAt,
    endsAt,
    validFrom: validFrom as string | null,
    validUntil: validUntil as string | null,
  });

  it("sans horaires propres : les horaires d'ouverture de l'établissement", () => {
    expect(workIntervalsOn("2026-10-06", { timezone: TZ, schedules: [], openingHours: OPENING })).toEqual([
      span("09:00", "18:00"),
    ]);
    expect(workIntervalsOn("2026-10-07", { timezone: TZ, schedules: [], openingHours: OPENING })).toEqual([]);
  });

  it("avec horaires propres : ils remplacent l'ouverture, selon leur période de validité", () => {
    const hours = {
      timezone: TZ,
      openingHours: OPENING,
      schedules: [
        schedule(2, "13:00", "16:00"),
        { ...schedule(3, "10:00", "12:00"), validFrom: "2026-10-14", validUntil: "2026-10-21" },
      ],
    };
    expect(workIntervalsOn("2026-10-06", hours)).toEqual([span("13:00", "16:00")]);
    expect(workIntervalsOn("2026-10-07", hours)).toEqual([]); // avant la période
    expect(workIntervalsOn("2026-10-14", hours)).toEqual([span("10:00", "12:00", "2026-10-14")]);
    expect(workIntervalsOn("2026-10-28", hours)).toEqual([]); // après la période
  });

  it("additionne les jours et retire congés et fermetures, y compris au changement d'heure", () => {
    const input = { timezone: TZ, schedules: [], openingHours: OPENING, firstDate: "2026-10-01", days: 31 };
    expect(availableMinutes({ ...input, timeOff: [] })).toBe(4 * 540);
    expect(
      availableMinutes({
        ...input,
        timeOff: [
          span("09:00", "12:00", "2026-10-13"),
          { start: at("00:00", "2026-10-27"), end: at("00:00", "2026-10-28") },
        ],
      }),
    ).toBe(4 * 540 - 180 - 540);
    // Dimanche 25 octobre 2026 (passage à l'heure d'hiver) : 9 h-18 h fait toujours 9 h.
    expect(
      availableMinutes({
        timezone: TZ,
        schedules: [],
        openingHours: [{ weekday: 7, opensAt: "09:00", closesAt: "18:00" }],
        firstDate: "2026-10-25",
        days: 1,
        timeOff: [],
      }),
    ).toBe(540);
  });

  it("taux : null sans minute disponible", () => {
    expect(fillRate(90, 360)).toBe(0.25);
    expect(fillRate(0, 0)).toBeNull();
    expect(fillRate(60, 0)).toBeNull();
  });
});

describe("marges", () => {
  it("coût absent : pas de marge", () => {
    expect(lineMargin(14000, 2, null)).toEqual({ costCents: null, marginCents: null });
    expect(lineMargin(14000, 2, 2500)).toEqual({ costCents: 5000, marginCents: 9000 });
    expect(lineMargin(1000, 1, 1500)).toEqual({ costCents: 1500, marginCents: -500 });
  });

  it("regroupe, trie par CA décroissant et totalise la marge des seules lignes avec coût", () => {
    const breakdown = salesBreakdown(
      [
        { key: "a", name: "Coupe", quantity: 1, revenueCents: 3000 },
        { key: "b", name: "Couleur", quantity: 1, revenueCents: 6000 },
        { key: "a", name: "Coupe", quantity: 1, revenueCents: 3000 },
        { key: "c", name: "Brushing", quantity: 1, revenueCents: 2000 },
      ],
      new Map<string, number | null>([
        ["a", 500],
        ["b", null],
      ]),
    );
    expect(
      breakdown.lines.map((line) => [line.key, line.quantity, line.revenueCents, line.marginCents]),
    ).toEqual([
      ["a", 2, 6000, 5000],
      ["b", 1, 6000, null],
      ["c", 1, 2000, null],
    ]);
    expect(breakdown).toMatchObject({ revenueCents: 14000, marginCents: 5000, withCost: 1 });
    expect(salesBreakdown([], new Map())).toEqual({
      lines: [],
      revenueCents: 0,
      marginCents: 0,
      withCost: 0,
    });
  });
});
