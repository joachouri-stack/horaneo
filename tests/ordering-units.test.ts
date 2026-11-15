import { describe, expect, it } from "vitest";
import { reorderedPositions } from "@/modules/ordering";

describe("ordre d'une liste (monter / descendre)", () => {
  const list = [
    { id: "a", sortOrder: 0 },
    { id: "b", sortOrder: 0 },
    { id: "c", sortOrder: 5 },
  ];

  it("échange avec le voisin et renumérote ce qui change", () => {
    // « b » passe en tête : sa position (0) ne change pas, seules celles de « a » et « c » sont écrites.
    expect(reorderedPositions(list, "b", "up")).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
    expect(reorderedPositions(list, "a", "down")).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ]);
  });

  it("rien au bout de la liste ; null pour un élément absent", () => {
    expect(reorderedPositions(list, "a", "up")).toEqual([]);
    expect(reorderedPositions(list, "c", "down")).toEqual([]);
    expect(reorderedPositions(list, "z", "up")).toBeNull();
  });
});
