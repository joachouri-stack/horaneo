import { describe, expect, it } from "vitest";
import { computeDeposit, computeTotals } from "@/modules/booking/pricing";
import {
  chooseLeastLoaded,
  computeDaySlots,
  isBookableDate,
  type DaySlotsInput,
  type StaffInput,
} from "@/modules/booking/slots";
import { addDays, isoWeekday, localToUtc, offsetMinutes, utcToLocal } from "@/modules/booking/time";

const TZ = "Europe/Paris";

describe("fuseaux horaires", () => {
  it("convertit une heure de Lyon en heure universelle, été comme hiver", () => {
    expect(localToUtc("2026-07-14", "10:00", TZ).toISOString()).toBe("2026-07-14T08:00:00.000Z");
    expect(localToUtc("2026-12-15", "10:00", TZ).toISOString()).toBe("2026-12-15T09:00:00.000Z");
  });

  it("gère les jours de changement d'heure", () => {
    // Passage à l'heure d'été (29 mars 2026) et à l'heure d'hiver (25 octobre 2026).
    expect(localToUtc("2026-03-29", "10:00", TZ).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    expect(localToUtc("2026-10-25", "10:00", TZ).toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(offsetMinutes(new Date("2026-03-29T00:30:00Z"), TZ)).toBe(60);
    expect(offsetMinutes(new Date("2026-03-29T01:30:00Z"), TZ)).toBe(120);
  });

  it("fonctionne pour d'autres fuseaux", () => {
    expect(localToUtc("2026-07-14", "10:00", "America/Montreal").toISOString()).toBe(
      "2026-07-14T14:00:00.000Z",
    );
    expect(utcToLocal(new Date("2026-07-14T14:00:00Z"), "America/Montreal")).toMatchObject({
      date: "2026-07-14",
      time: "10:00",
    });
  });

  it("calendrier : jours suivants et jour de la semaine", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(isoWeekday("2026-10-05")).toBe(1); // lundi
    expect(isoWeekday("2026-10-04")).toBe(7); // dimanche
  });
});

// Mardi 6 octobre 2026 ; « maintenant » = lundi 5 octobre, 9 h à Paris.
const DAY = "2026-10-06";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const at = (time: string, date = DAY) => localToUtc(date, time, TZ);

function member(id: string, overrides: Partial<StaffInput> = {}): StaffInput {
  return {
    id,
    sortOrder: 0,
    schedules: [{ weekday: 2, startsAt: "09:00", endsAt: "18:00", validFrom: null, validUntil: null }],
    appointments: [],
    timeOff: [],
    ...overrides,
  };
}

function input(overrides: Partial<DaySlotsInput> = {}): DaySlotsInput {
  return {
    date: DAY,
    now: NOW,
    rules: { timezone: TZ, minNoticeMinutes: 120, maxAdvanceDays: 60, slotIntervalMinutes: 15 },
    durationMinutes: 60,
    bufferMinutes: 0,
    openingHours: [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }],
    closures: [],
    staff: [member("lea")],
    ...overrides,
  };
}

const times = (slots: ReturnType<typeof computeDaySlots>) => slots.map((slot) => slot.time);

describe("calcul des créneaux", () => {
  it("propose un créneau toutes les 15 minutes, la prestation tenant avant la fermeture", () => {
    const slots = times(computeDaySlots(input()));
    expect(slots[0]).toBe("09:00");
    expect(slots[1]).toBe("09:15");
    expect(slots.at(-1)).toBe("17:00");
    expect(slots).toHaveLength(33);
  });

  it("stocke les créneaux en heure universelle", () => {
    expect(computeDaySlots(input())[0].start.toISOString()).toBe("2026-10-06T07:00:00.000Z");
  });

  it("respecte l'intervalle choisi par la gérante", () => {
    const slots = times(
      computeDaySlots(
        input({ rules: { timezone: TZ, minNoticeMinutes: 0, maxAdvanceDays: 60, slotIntervalMinutes: 30 } }),
      ),
    );
    expect(slots.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("aligne les créneaux sur l'horloge même si l'ouverture est à 9:10", () => {
    const slots = times(
      computeDaySlots(input({ openingHours: [{ weekday: 2, opensAt: "09:10", closesAt: "12:00" }] })),
    );
    expect(slots[0]).toBe("09:15");
  });

  it("respecte le délai minimum de 2 heures", () => {
    const today = computeDaySlots(
      input({
        date: "2026-10-05",
        openingHours: [{ weekday: 1, opensAt: "09:00", closesAt: "18:00" }],
        staff: [
          member("lea", {
            schedules: [
              { weekday: 1, startsAt: "09:00", endsAt: "18:00", validFrom: null, validUntil: null },
            ],
          }),
        ],
      }),
    );
    expect(times(today)[0]).toBe("11:00");
  });

  it("ne propose rien au-delà de 60 jours, ni dans le passé", () => {
    const rules = input().rules;
    expect(isBookableDate("2026-12-04", NOW, rules)).toBe(true);
    expect(isBookableDate("2026-12-05", NOW, rules)).toBe(false);
    expect(isBookableDate("2026-10-04", NOW, rules)).toBe(false);
  });

  it("additionne les durées de plusieurs prestations", () => {
    const slots = times(computeDaySlots(input({ durationMinutes: 150 })));
    expect(slots.at(-1)).toBe("15:30");
  });

  it("un jour sans horaires d'ouverture n'a aucun créneau", () => {
    expect(
      computeDaySlots(input({ openingHours: [{ weekday: 3, opensAt: "09:00", closesAt: "18:00" }] })),
    ).toEqual([]);
  });

  it("respecte la pause déjeuner (deux plages)", () => {
    const slots = times(
      computeDaySlots(
        input({
          openingHours: [
            { weekday: 2, opensAt: "09:00", closesAt: "12:00" },
            { weekday: 2, opensAt: "14:00", closesAt: "18:00" },
          ],
        }),
      ),
    );
    expect(slots).toContain("11:00");
    expect(slots).not.toContain("11:15");
    expect(slots).not.toContain("13:00");
    expect(slots).toContain("14:00");
  });

  it("ne dépasse ni les horaires d'ouverture ni ceux du membre", () => {
    const slots = times(
      computeDaySlots(
        input({
          staff: [
            member("lea", {
              schedules: [
                { weekday: 2, startsAt: "08:00", endsAt: "13:00", validFrom: null, validUntil: null },
              ],
            }),
          ],
        }),
      ),
    );
    expect(slots[0]).toBe("09:00");
    expect(slots.at(-1)).toBe("12:00");
  });

  it("tient compte de la période de validité des horaires d'un membre", () => {
    const summer = member("lea", {
      schedules: [
        { weekday: 2, startsAt: "09:00", endsAt: "18:00", validFrom: "2026-06-01", validUntil: "2026-09-30" },
      ],
    });
    expect(computeDaySlots(input({ staff: [summer] }))).toEqual([]);
  });

  it("évite les rendez-vous existants, battement compris", () => {
    const slots = times(
      computeDaySlots(
        input({ staff: [member("lea", { appointments: [{ start: at("10:00"), end: at("11:15") }] })] }),
      ),
    );
    expect(slots).toContain("09:00");
    expect(slots).not.toContain("09:15"); // finirait à 10:15, dans le rendez-vous
    expect(slots).not.toContain("11:00");
    expect(slots).toContain("11:15");
  });

  it("ajoute le battement de la nouvelle prestation avant le rendez-vous suivant", () => {
    const slots = times(
      computeDaySlots(
        input({
          bufferMinutes: 15,
          staff: [member("lea", { appointments: [{ start: at("11:00"), end: at("12:00") }] })],
        }),
      ),
    );
    expect(slots).toContain("09:45"); // 9:45-10:45 + 15 min = 11:00
    expect(slots).not.toContain("10:00");
  });

  it("le battement peut déborder après la fermeture", () => {
    expect(times(computeDaySlots(input({ bufferMinutes: 30 }))).at(-1)).toBe("17:00");
  });

  it("évite les congés du membre et les fermetures de l'établissement", () => {
    const leave = times(
      computeDaySlots(
        input({ staff: [member("lea", { timeOff: [{ start: at("12:00"), end: at("18:00") }] })] }),
      ),
    );
    expect(leave.at(-1)).toBe("11:00");
    const closed = computeDaySlots(input({ closures: [{ start: at("00:00"), end: at("23:59") }] }));
    expect(closed).toEqual([]);
  });

  it("« sans préférence » : un créneau est proposé si au moins un membre est libre", () => {
    const slots = computeDaySlots(
      input({
        staff: [member("lea", { appointments: [{ start: at("10:00"), end: at("11:00") }] }), member("ines")],
      }),
    );
    const ten = slots.find((slot) => slot.time === "10:00")!;
    expect(ten.staffIds).toEqual(["ines"]);
    expect(slots.find((slot) => slot.time === "09:00")!.staffIds.sort()).toEqual(["ines", "lea"]);
  });

  it("jour de passage à l'heure d'hiver : les heures locales restent justes", () => {
    const slots = computeDaySlots(
      input({
        date: "2026-10-25",
        now: localToUtc("2026-10-20", "09:00", TZ),
        openingHours: [{ weekday: 7, opensAt: "10:00", closesAt: "12:00" }],
        staff: [
          member("lea", {
            schedules: [
              { weekday: 7, startsAt: "10:00", endsAt: "12:00", validFrom: null, validUntil: null },
            ],
          }),
        ],
      }),
    );
    expect(slots[0]).toMatchObject({ time: "10:00" });
    expect(slots[0].start.toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
});

describe("membre le moins chargé", () => {
  const staff = [
    { id: "lea", sortOrder: 0 },
    { id: "ines", sortOrder: 1 },
    { id: "zoe", sortOrder: 2 },
  ];

  it("choisit celle qui a le moins de minutes réservées ce jour-là", () => {
    expect(
      chooseLeastLoaded(
        ["lea", "ines"],
        staff,
        new Map([
          ["lea", 180],
          ["ines", 60],
        ]),
      ),
    ).toBe("ines");
  });

  it("à égalité, suit l'ordre choisi par l'établissement", () => {
    expect(chooseLeastLoaded(["zoe", "ines"], staff, new Map())).toBe("ines");
  });

  it("ne choisit que parmi les membres disponibles", () => {
    expect(chooseLeastLoaded(["zoe"], staff, new Map([["zoe", 500]]))).toBe("zoe");
    expect(chooseLeastLoaded([], staff, new Map())).toBeNull();
  });
});

describe("totaux et acompte", () => {
  const services = [
    { durationMinutes: 60, bufferMinutes: 10, priceCents: 6500, currency: "EUR" },
    { durationMinutes: 30, bufferMinutes: 5, priceCents: 2500, currency: "EUR" },
  ];

  it("additionne durées, battements et prix", () => {
    expect(computeTotals(services)).toEqual({
      durationMinutes: 90,
      bufferMinutes: 15,
      totalCents: 9000,
      currency: "EUR",
    });
  });

  it("acompte de 30 % ou montant fixe, jamais plus que le total", () => {
    const base = { depositEnabled: true, depositType: "percent" as const, depositValue: 30 };
    expect(computeDeposit(9000, base, true)).toBe(2700);
    expect(computeDeposit(3333, base, true)).toBe(1000);
    expect(computeDeposit(9000, { ...base, depositType: "fixed", depositValue: 2000 }, true)).toBe(2000);
    expect(computeDeposit(1500, { ...base, depositType: "fixed", depositValue: 2000 }, true)).toBe(1500);
  });

  it("pas d'acompte s'il est désactivé ou si le pack n'inclut pas le paiement en ligne", () => {
    expect(
      computeDeposit(9000, { depositEnabled: false, depositType: "percent", depositValue: 30 }, true),
    ).toBe(0);
    expect(
      computeDeposit(9000, { depositEnabled: true, depositType: "percent", depositValue: 30 }, false),
    ).toBe(0);
  });
});
