import { describe, expect, it } from "vitest";
import { DEFAULT_OFFER_PLANS } from "@/config/defaults";
import {
  dependenciesOf,
  dependentsOf,
  monthlyTotal,
  resolveOptions,
  type PricedOption,
} from "@/modules/billing/option-total";
import { planSheet, sheetComparison } from "@/modules/billing/plan-sheet";
import { planTiles } from "@/modules/billing/showcase";

const CATALOG: PricedOption[] = [
  { code: "booking", priceCents: 1000, orderable: true, requires: [] },
  { code: "online-payment", priceCents: 500, orderable: true, requires: ["booking"] },
  { code: "gift-cards", priceCents: 300, orderable: true, requires: ["online-payment"] },
  { code: "reviews", priceCents: null, orderable: true, requires: [] },
  { code: "shop", priceCents: 900, orderable: false, requires: [] },
];

describe("options : calcul du total", () => {
  it("ajoute les dépendances, dans l'ordre du catalogue", () => {
    expect(resolveOptions(["gift-cards"], CATALOG)).toEqual(["booking", "online-payment", "gift-cards"]);
    expect(dependenciesOf("gift-cards", CATALOG)).toEqual(["booking", "online-payment"]);
  });

  it("écarte une option sans tarif, pas encore livrée ou inconnue", () => {
    expect(resolveOptions(["reviews", "shop", "nope", "booking"], CATALOG)).toEqual(["booking"]);
  });

  it("calcule le total mensuel : pack + options", () => {
    expect(monthlyTotal(3990, ["online-payment"], CATALOG)).toEqual({
      codes: ["booking", "online-payment"],
      lines: [
        { code: "booking", priceCents: 1000 },
        { code: "online-payment", priceCents: 500 },
      ],
      optionsCents: 1500,
      totalCents: 5490,
    });
    expect(monthlyTotal(1990, [], CATALOG).totalCents).toBe(1990);
  });

  it("retire avec une option celles qui en ont besoin", () => {
    expect(dependentsOf("booking", ["booking", "online-payment", "gift-cards"], CATALOG)).toEqual([
      "online-payment",
      "gift-cards",
    ]);
    expect(dependentsOf("gift-cards", ["booking", "online-payment", "gift-cards"], CATALOG)).toEqual([]);
  });
});

describe("packs Essentiel, Business, Premium", () => {
  const [essentiel, business, premium] = DEFAULT_OFFER_PLANS;
  const soon = new Set(["advancedBranding"]);

  it("annoncent 3, 7 et 15 pages, et leurs prix", () => {
    expect(DEFAULT_OFFER_PLANS.map((plan) => [plan.priceCents, plan.limits.pages])).toEqual([
      [1990, 3],
      [3990, 7],
      [5990, 15],
    ]);
    expect(planTiles(essentiel)[0]).toEqual({ key: "pageCount", count: 3 });
  });

  it("chaque pack comprend tout le pack précédent", () => {
    for (const [lower, upper] of [
      [essentiel, business],
      [business, premium],
    ]) {
      for (const [key, value] of Object.entries(lower.features))
        if (value) expect(upper.features[key], `${upper.code} : ${key}`).toBe(true);
    }
  });

  it("verso : rubriques courtes, « Bientôt » sur ce qui n'est pas livré", () => {
    const sheet = planSheet(business, soon);
    expect(sheet.map((item) => item.section)).toEqual([
      "site",
      "branding",
      "management",
      "visibility",
      "hosting",
      "support",
    ]);
    const branding = sheet.find((item) => item.section === "branding")!.lines;
    expect(branding).toContainEqual({ key: "advancedBranding", values: undefined, soon: true });
    expect(sheet[0].lines[0]).toEqual({ key: "pages", values: { count: 7 }, soon: false });
    // Support standard pour Essentiel, prioritaire ensuite.
    expect(
      planSheet(essentiel, soon)
        .at(-1)!
        .lines.map((line) => line.key),
    ).toEqual(["standardSupport"]);
    expect(
      planSheet(premium, soon)
        .at(-1)!
        .lines.map((line) => line.key),
    ).toEqual(["prioritySupport", "dedicatedSupport"]);
  });

  it("comparatif : une ligne absente d'un pack est vide pour lui", () => {
    const rows = sheetComparison(DEFAULT_OFFER_PLANS, soon);
    const premiumOnly = rows.find((row) => row.key === "premiumBranding")!;
    expect(premiumOnly.cells.map(Boolean)).toEqual([false, false, true]);
  });
});
