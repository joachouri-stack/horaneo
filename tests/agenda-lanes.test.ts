import { describe, expect, it } from "vitest";
import { layoutLanes } from "@/modules/agenda/lanes";
import { trendPercent } from "@/modules/stats/dashboard";

const at = (time: string) => new Date(`2026-10-23T${time}:00Z`);
const item = (id: string, from: string, to: string) => ({ id, startsAt: at(from), endsAt: at(to) });

describe("agenda : rendez-vous côte à côte", () => {
  it("un rendez-vous seul occupe toute la largeur", () => {
    expect(layoutLanes([item("a", "09:00", "10:00")]).get("a")).toEqual({ lane: 0, lanes: 1 });
  });

  it("deux rendez-vous qui se chevauchent se partagent la colonne", () => {
    const lanes = layoutLanes([item("a", "09:00", "10:00"), item("b", "09:30", "10:30")]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
  });

  it("un rendez-vous qui commence à la fin du précédent reprend toute la largeur", () => {
    const lanes = layoutLanes([
      item("a", "09:00", "10:00"),
      item("b", "09:30", "10:30"),
      item("c", "10:30", "11:00"),
    ]);
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 1 });
  });

  it("un couloir libéré est réutilisé dans le même groupe", () => {
    const lanes = layoutLanes([
      item("a", "09:00", "12:00"),
      item("b", "09:00", "10:00"),
      item("c", "10:00", "11:00"),
    ]);
    expect(lanes.get("b")?.lane).toBe(1);
    expect(lanes.get("c")).toEqual({ lane: 1, lanes: 2 });
  });
});

describe("tableau de bord : évolution", () => {
  it("en pourcentage arrondi, rien sans période de comparaison", () => {
    expect(trendPercent(120, 100)).toBe(20);
    expect(trendPercent(90, 100)).toBe(-10);
    expect(trendPercent(5, 0)).toBeNull();
  });
});
