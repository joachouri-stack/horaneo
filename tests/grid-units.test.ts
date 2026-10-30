import { describe, expect, it } from "vitest";
import { DEFAULT_GRID_PLANS, DEFAULT_PLATFORM_SETTINGS } from "@/config/defaults";
import { gridCard, gridComparison } from "@/modules/billing/grid";
import { crossedLevel } from "@/modules/billing/usage";
import messages from "../messages/fr.json";

const SOON = new Set<string>(DEFAULT_PLATFORM_SETTINGS.features_soon);
// La grille montre les packs en vente (le Basic gratuit est hors vente).
const GRID = DEFAULT_GRID_PLANS.filter((plan) => plan.isPublic);
const [starter, pro, business] = GRID;

describe("grille des packs : une seule source pour les cartes et le comparatif", () => {
  it("donne les quotas réglés, « illimité » ou « non inclus »", () => {
    const rows = gridComparison(GRID, SOON).flatMap((group) => group.rows);
    const row = (key: string) => rows.find((item) => item.key === key)!.cells;
    expect(row("bookings")).toEqual([
      { included: true, count: null },
      { included: true, count: null },
      { included: true, count: null },
    ]);
    expect(row("sms")).toEqual([
      { included: false },
      { included: true, count: 100 },
      { included: true, count: 300 },
    ]);
    expect(row("aiChatbot")).toEqual([
      { included: false },
      { included: false },
      { included: true, count: 500 },
    ]);
    // Starter : contacts clients illimités (la réservation en ligne ne s'arrête jamais).
    expect(row("customers")[0]).toEqual({ included: true, count: null });
    expect(row("photos")[0]).toEqual({ included: true, count: 50 });
    // Starter : site multipage (le site vitrine disparaît), nouvelles promesses incluses dans les trois packs.
    expect(rows.find((item) => item.key === "miniSite")).toBeUndefined();
    for (const key of [
      "fullSite",
      "onlinePayment",
      "whatsappSupport",
      "maintenance",
      "hosting",
      "favicon",
      "responsive",
      "technicalSupport247",
      "ticketSupport",
    ])
      expect(row(key), key).toEqual([{ included: true }, { included: true }, { included: true }]);
    // Pro et Business : cartes cadeaux, nom de domaine et e-mail d'anniversaire inclus.
    for (const key of ["giftCards", "freeDomain", "birthdayOffer"])
      expect(row(key), key).toEqual([{ included: false }, { included: true }, { included: true }]);
  });

  it("range les lignes dans les douze catégories, Commerce et Formation marquées « Bientôt »", () => {
    const groups = gridComparison(GRID, SOON);
    expect(groups.map((group) => group.category)).toEqual([
      "site",
      "booking",
      "commerce",
      "formation",
      "crm",
      "marketing",
      "payments",
      "ai",
      "messaging",
      "stats",
      "hosting",
      "support",
    ]);
    const commerce = groups.find((group) => group.category === "commerce")!.rows[0];
    expect(commerce).toMatchObject({ solution: "commerce", soon: true });
  });

  it("carte : ce que le pack ajoute au précédent, les fonctions annoncées à part", () => {
    const card = gridCard(business, GRID, SOON);
    expect(card.previous).toBe("pro");
    expect(card.included.every((line) => !line.soon)).toBe(true);
    expect(card.included.map((line) => line.key)).not.toContain("aiChatbot");
    expect(card.upcoming.map((line) => line.key)).toContain("aiChatbot");
    expect(card.included.map((line) => line.key)).toContain("sms");
    expect(gridCard(starter, GRID, SOON).missing.length).toBeLessThanOrEqual(3);
    // Pro : chatbot (questions et réponses) inclus.
    // Langues en plus et chatbot : pas encore développés, annoncés « Bientôt » avec Commerce et Formation.
    const proCard = gridCard(pro, GRID, SOON);
    expect(proCard.upcoming.map((line) => line.key)).toEqual([
      "multilingual",
      "commerce",
      "formation",
      "chatbotQuestions",
    ]);
    expect(proCard.upcoming.find((line) => line.key === "chatbotQuestions")?.count).toBe(20);
    expect(gridCard(pro, GRID, SOON).included.map((line) => line.key)).toContain("setupAssistance");
    // Cartes cadeaux et nom de domaine : en tête des cartes Pro et Business, absents du Starter.
    for (const plan of [pro, business])
      expect(
        gridCard(plan, GRID, SOON)
          .included.slice(0, 2)
          .map((line) => line.key)
          .sort(),
      ).toEqual(["freeDomain", "giftCards"]);
    expect(gridCard(starter, GRID, SOON).included.map((line) => line.key)).not.toContain("freeDomain");
  });

  it("chaque ligne a ses textes (comparatif et carte)", () => {
    const rows = messages.home.grid.rows as Record<string, { label: string; card: string }>;
    for (const group of gridComparison(GRID, SOON))
      for (const row of group.rows) expect(rows[row.key]?.label, row.key).toBeTruthy();
  });
});

describe("quotas mensuels : alertes", () => {
  it("prévient une fois au seuil, puis à 100 %", () => {
    expect(crossedLevel(79, 80, 100, 80)).toBe(80);
    expect(crossedLevel(80, 81, 100, 80)).toBeNull();
    expect(crossedLevel(99, 100, 100, 80)).toBe(100);
    expect(crossedLevel(70, 100, 100, 80)).toBe(100);
    expect(crossedLevel(0, 1, 0, 80)).toBeNull();
  });
});

describe("paiement à l'année", () => {
  it("12 mois moins les mois offerts", async () => {
    const { yearlyPriceCents, monthlyEquivalentCents, yearlySavingCents, parseInterval } =
      await import("@/modules/billing/yearly");
    expect(yearlyPriceCents(3990, 2)).toBe(39900);
    expect(yearlyPriceCents(7900, 0)).toBe(94800);
    expect(yearlyPriceCents(7900, 20)).toBe(7900);
    expect(monthlyEquivalentCents(39900)).toBe(3325);
    expect(yearlySavingCents(7900, 2)).toBe(15800);
    expect(parseInterval("year")).toBe("year");
    expect(parseInterval("autre")).toBe("month");
  });
});
