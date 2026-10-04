import { describe, expect, it } from "vitest";
import { giftCardState, normalizeGiftCardCode } from "@/modules/giftcards/giftcards";
import { parseMoney } from "@/modules/money";
import { discountedPrice, referencePrice } from "@/modules/promotions/promotions";

const d = (iso: string) => new Date(`${iso}T10:00:00Z`);

describe("promotions : prix de référence", () => {
  const start = d("2026-11-01");
  it("prend le prix le plus bas des 30 jours précédents, prix en vigueur au début compris", () => {
    const history = [
      { priceCents: 6000, startsAt: d("2026-08-01") }, // en vigueur au début de la fenêtre
      { priceCents: 5000, startsAt: d("2026-10-10") }, // baisse pendant la fenêtre
      { priceCents: 7000, startsAt: d("2026-10-28") }, // hausse juste avant
    ];
    expect(referencePrice(history, start)).toBe(5000);
  });
  it("ignore les prix plus anciens que la fenêtre (sauf celui encore en vigueur)", () => {
    const history = [
      { priceCents: 3000, startsAt: d("2026-01-01") },
      { priceCents: 6000, startsAt: d("2026-09-01") },
    ];
    expect(referencePrice(history, start)).toBe(6000);
  });
  it("ne tient pas compte d'un changement après le début", () => {
    expect(referencePrice([{ priceCents: 2000, startsAt: d("2026-11-05") }], start)).toBeNull();
  });
  it("réduction en pourcentage ou montant retiré, jamais négative", () => {
    expect(discountedPrice(7000, "percent", 20)).toBe(5600);
    expect(discountedPrice(7000, "fixed", 1000)).toBe(6000);
    expect(discountedPrice(500, "fixed", 1000)).toBe(0);
  });
});

describe("cartes cadeaux", () => {
  it("lit un code tapé avec des espaces, minuscules ou sans tirets", () => {
    expect(normalizeGiftCardCode("abcd efgh jkmn")).toBe("ABCD-EFGH-JKMN");
    expect(normalizeGiftCardCode("ABCD-EFGH-JKMN")).toBe("ABCD-EFGH-JKMN");
  });
  it("état : active, utilisée (solde nul), expirée, en attente de paiement", () => {
    const now = d("2026-11-01");
    const card = { status: "active" as const, balanceCents: 1000, expiresAt: d("2027-01-01") };
    expect(giftCardState(card, now)).toBe("active");
    expect(giftCardState({ ...card, balanceCents: 0 }, now)).toBe("used");
    expect(giftCardState({ ...card, expiresAt: d("2026-10-01") }, now)).toBe("expired");
    expect(giftCardState({ ...card, status: "pending_payment" }, now)).toBe("pending_payment");
  });
  it("montants saisis en euros", () => {
    expect(parseMoney("50")).toBe(5000);
    expect(parseMoney("42,50")).toBe(4250);
    expect(Number.isNaN(parseMoney("abc"))).toBe(true);
    expect(Number.isNaN(parseMoney("-5"))).toBe(true);
  });
});
