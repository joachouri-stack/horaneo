import { describe, expect, it } from "vitest";
import { categoryFields, isCategoryIcon } from "@/modules/catalog/icons";
import { formatPhone } from "@/modules/phone";
import { mergeHours } from "@/modules/site/data";
import { formatClock, groupHours, openDaysSpan } from "@/modules/site/format";
import { buildTheme } from "@/modules/site/theme";

/** Modèle Atelier : horaires du lieu, mises en forme, pictogrammes, ambiance. */
describe("modèle Atelier", () => {
  const week = [
    ...[1, 2, 3, 5].map((weekday) => ({ weekday, opensAt: "09:00", closesAt: "19:00" })),
    { weekday: 4, opensAt: "09:30", closesAt: "19:00" },
    { weekday: 6, opensAt: "10:00", closesAt: "20:00" },
  ];

  it("réunit les horaires de deux entreprises sans doublon", () => {
    const merged = mergeHours([...week, ...week, { weekday: 1, opensAt: "18:00", closesAt: "20:00" }]);
    expect(merged.filter((range) => range.weekday === 1)).toEqual([
      { weekday: 1, opensAt: "09:00", closesAt: "20:00" },
    ]);
    expect(merged).toHaveLength(6);
  });

  it("résume les horaires par groupes de jours identiques", () => {
    const groups = groupHours(week).map((group) => [group.from, group.to, group.ranges.length]);
    expect(groups).toEqual([
      [1, 3, 1],
      [4, 4, 1],
      [5, 5, 1],
      [6, 6, 1],
      [7, 7, 0],
    ]);
    expect(openDaysSpan(week)).toEqual({ from: 1, to: 6 });
    expect(
      openDaysSpan([
        { weekday: 1, opensAt: "09:00", closesAt: "12:00" },
        { weekday: 3, opensAt: "09:00", closesAt: "12:00" },
      ]),
    ).toBeNull();
  });

  it("écrit les heures à la française", () => {
    expect(formatClock("09:00", "fr")).toBe("9 h");
    expect(formatClock("09:30", "fr")).toBe("9 h 30");
    expect(formatClock("19:00", "en")).toMatch(/7:00/);
  });

  it("affiche un numéro du pays du site au format national", () => {
    expect(formatPhone("+33652170608", "FR")).toBe("06 52 17 06 08");
    expect(formatPhone("+33652170608")).toBe("+33 6 52 17 06 08");
    expect(formatPhone("+34612345678", "FR")).toMatch(/^\+34/);
  });

  it("n'accepte que les pictogrammes de la liste", () => {
    expect(isCategoryIcon("eye")).toBe(true);
    expect(isCategoryIcon("<script>")).toBe(false);
    const full = new FormData();
    full.set("name", "Beauté du regard");
    full.set("icon", "pirate");
    full.set("isFeatured", "on");
    expect(categoryFields(full)).toMatchObject({ name: "Beauté du regard", icon: null, isFeatured: true });
    const quick = new FormData();
    quick.set("name", "Épilation");
    expect(categoryFields(quick)).toEqual({ name: "Épilation", description: undefined });
  });

  it("ambiance rose poudré : texte lisible sur le fond et sur les boutons", async () => {
    const { contrastRatio } = await import("@/lib/colors");
    const theme = buildTheme("blush", { primary: "#a0545a", secondary: "#f1d6d4" });
    expect(contrastRatio(theme.colors.text, theme.colors.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(theme.colors.onButton, theme.colors.button)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.colors.bg, theme.colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(theme.colors.card).toBe("#ffffff");
  });
});

describe("horaires résumés", () => {
  const range = (weekday: number, opensAt: string, closesAt: string) => ({ weekday, opensAt, closesAt });
  it("« Lundi au vendredi », puis « Jeudi dès 9 h 30 », samedi, dimanche fermé", async () => {
    const { summarizeHours } = await import("@/modules/site/format");
    const rows = summarizeHours([
      ...[1, 2, 3, 5].map((d) => range(d, "09:00", "19:00")),
      range(4, "09:30", "19:00"),
      range(6, "10:00", "20:00"),
    ]);
    expect(rows).toEqual([
      { from: 1, to: 5, kind: "ranges", ranges: [{ weekday: 0, opensAt: "09:00", closesAt: "19:00" }] },
      { from: 4, to: 4, kind: "opensLater", opensAt: "09:30" },
      { from: 6, to: 6, kind: "ranges", ranges: [range(6, "10:00", "20:00")] },
      { from: 7, to: 7, kind: "closed" },
    ]);
  });
  it("ne regroupe pas des jours fermés séparés par la semaine", async () => {
    const { summarizeHours } = await import("@/modules/site/format");
    const rows = summarizeHours([2, 3, 4].map((d) => range(d, "09:00", "18:00")));
    expect(rows.map((row) => [row.from, row.to, row.kind])).toEqual([
      [1, 1, "closed"],
      [2, 4, "ranges"],
      [5, 7, "closed"],
    ]);
  });
  it("horaires coupés : un jour par ligne, sans résumé hasardeux", async () => {
    const { summarizeHours } = await import("@/modules/site/format");
    const rows = summarizeHours([
      range(1, "09:00", "12:00"),
      range(1, "14:00", "19:00"),
      range(2, "09:00", "12:00"),
    ]);
    expect(rows[0]).toMatchObject({ from: 1, to: 1, kind: "ranges" });
  });
});
