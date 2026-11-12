import { describe, expect, it } from "vitest";
import { ttcHintCents, withVatCents } from "@/modules/billing/vat";

describe("TVA des prix affichés", () => {
  it("ajoute la TVA au prix HT, arrondie au centime", () => {
    expect(withVatCents(1999, 20)).toBe(2399);
    expect(withVatCents(3900, 20)).toBe(4680);
    expect(withVatCents(1999, 0)).toBe(1999);
  });

  it("ne donne un complément TTC que pour un prix HT avec TVA", () => {
    expect(ttcHintCents(1999, "HT", 20)).toBe(2399);
    expect(ttcHintCents(1999, "TTC", 20)).toBeNull();
    expect(ttcHintCents(1999, "HT", 0)).toBeNull();
    expect(ttcHintCents(0, "HT", 20)).toBeNull();
  });
});
