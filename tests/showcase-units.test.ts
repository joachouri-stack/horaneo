import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { DEFAULT_PLANS, DEFAULT_SITE_ONLY_PLANS } from "@/config/defaults";
import { formatMoney } from "@/lib/format";
import { planCardContent, type CardPlan, type PlansTranslator } from "@/modules/billing/plan-card";
import {
  comparisonLines,
  HIGHLIGHT_KEYS,
  MAX_HIGHLIGHTS,
  planFullList,
  planHighlights,
  planTiles,
  SHOWCASE_GROUPS,
  splitPlans,
  twinRuleViolations,
} from "@/modules/billing/showcase";
import messages from "../messages/fr.json";

const ALL = [...DEFAULT_PLANS, ...DEFAULT_SITE_ONLY_PLANS];
const NOTHING_SOON = new Set<string>();
const cards: CardPlan[] = ALL.map((plan) => ({
  ...plan,
  id: plan.code,
  bookingTwinCode: plan.bookingTwinCode ?? null,
}));
const t = createTranslator({ locale: "fr", messages, namespace: "home.plans" }) as unknown as PlansTranslator;
const plansMessages = messages.home.plans as unknown as {
  highlights: Record<string, string>;
  lines: Record<string, string>;
};

describe("présentation des packs sur le site commercial", () => {
  it("donne les trois chiffres clés de chaque pack", () => {
    expect(DEFAULT_PLANS.map(planTiles)).toEqual([
      [{ key: "bookings", count: 5 }, { key: "members", count: 1 }, { key: "emailReminders" }],
      [
        { key: "bookings", count: null },
        { key: "members", count: 3 },
        { key: "sms", count: 100 },
      ],
      [
        { key: "bookings", count: null },
        { key: "members", count: null },
        { key: "sms", count: 300 },
      ],
    ]);
    expect(planTiles(DEFAULT_SITE_ONLY_PLANS[0])).toEqual([
      { key: "pages", fullSite: false },
      { key: "photos", count: 10 },
      { key: "domain" },
    ]);
  });

  it("sépare les packs avec réservation des packs « site seul », chacun dans son ordre", () => {
    const { booking, siteOnly } = splitPlans(ALL);
    expect(booking.map((plan) => plan.code)).toEqual(["basic", "essentiel", "serenite"]);
    expect(siteOnly.map((plan) => plan.code)).toEqual(["express", "vitrine", "signature"]);
  });

  it("affiche les lignes visibles choisies pour chaque pack, 6 au plus, dans l'ordre", () => {
    for (const plan of ALL) {
      const lines = planHighlights(plan, ALL, NOTHING_SOON);
      expect(lines.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
      expect(
        lines.map((line) =>
          line.key === "everythingIn"
            ? `everythingIn:${line.values?.planCode}`
            : line.key.replace(/Unlimited$/, ""),
        ),
      ).toEqual(plan.highlights);
    }
  });

  it("n'utilise que des lignes connues et traduites", () => {
    for (const plan of ALL) {
      for (const key of plan.highlights ?? []) {
        if (!key.startsWith("everythingIn:")) expect(HIGHLIGHT_KEYS).toContain(key);
      }
      for (const line of planHighlights(plan, ALL, NOTHING_SOON)) {
        expect(plansMessages.highlights[line.key], line.key).toBeTypeOf("string");
      }
      const full = planFullList(plan, ALL, NOTHING_SOON);
      for (const line of [...full.groups.flatMap((group) => group.lines), ...full.missing]) {
        expect(plansMessages.lines[line.key], line.key).toBeTypeOf("string");
      }
    }
  });

  it("range la liste complète en six groupes pour Signature et Sérénité seulement", () => {
    const grouped = ALL.filter((plan) => planFullList(plan, ALL, NOTHING_SOON).grouped).map(
      (plan) => plan.code,
    );
    expect(grouped).toEqual(["serenite", "signature"]);
    const signature = planFullList(DEFAULT_SITE_ONLY_PLANS[2], ALL, NOTHING_SOON);
    expect(signature.groups.map((group) => group.group)).toEqual([...SHOWCASE_GROUPS]);
    // Dernier pack de sa famille : rien ne lui manque.
    expect(signature.missing).toEqual([]);
    // Express : ce que Vitrine ajoute, en gris à la fin (3 au plus).
    const express = planFullList(DEFAULT_SITE_ONLY_PLANS[0], ALL, NOTHING_SOON);
    expect(express.missing.length).toBeGreaterThan(0);
    expect(express.missing.length).toBeLessThanOrEqual(3);
  });

  it("marque « Bientôt » les fonctions pas encore livrées (réglage)", () => {
    const vitrine = DEFAULT_SITE_ONLY_PLANS[1];
    const soon = planHighlights(vitrine, ALL, new Set(["contactForm"]));
    expect(soon.find((line) => line.key === "contactForm")?.soon).toBe(true);
    expect(planHighlights(vitrine, ALL, NOTHING_SOON).every((line) => !line.soon)).toBe(true);
  });

  it("compare les packs ligne par ligne, avec les nombres des réglages", () => {
    const { booking } = splitPlans(ALL);
    const photos = comparisonLines(booking, NOTHING_SOON).find((row) => row.key === "photos")!;
    expect(photos.valued).toBe(true);
    expect(photos.cells.map((cell) => cell?.key)).toEqual(["photos", "photos", "photosUnlimited"]);
    expect(photos.cells[0]?.values).toEqual({ count: 5 });
  });
});

describe("règle des jumeaux", () => {
  it("chaque pack « site seul » est entièrement compris dans son jumeau avec réservation", () => {
    expect(twinRuleViolations(ALL)).toEqual([]);
    expect(DEFAULT_SITE_ONLY_PLANS.map((plan) => [plan.code, plan.bookingTwinCode])).toEqual([
      ["express", "essentiel"],
      ["vitrine", "essentiel"],
      ["signature", "serenite"],
    ]);
  });

  it("signale une fonction ou une limite que le jumeau n'a pas", () => {
    const plans = structuredClone(ALL);
    plans.find((plan) => plan.code === "vitrine")!.features.googleReviews = true;
    plans.find((plan) => plan.code === "express")!.limits.photos = 50;
    const problems = twinRuleViolations(plans);
    expect(problems.some((problem) => problem.includes("vitrine") && problem.includes("googleReviews"))).toBe(
      true,
    );
    expect(problems.some((problem) => problem.includes("express") && problem.includes("photos"))).toBe(true);
  });

  it("refuse un jumeau qui n'existe pas ; un pack sans jumeau (pack à options) n'est pas concerné", () => {
    const plans = structuredClone(ALL);
    plans.find((plan) => plan.code === "signature")!.bookingTwinCode = "inconnu";
    expect(twinRuleViolations(plans)).toHaveLength(1);
    plans.find((plan) => plan.code === "signature")!.bookingTwinCode = null;
    expect(twinRuleViolations(plans)).toEqual([]);
  });
});

describe("cartes des packs", () => {
  const options = { t, locale: "fr" as const, soon: NOTHING_SOON, smsPack: { size: 100, priceCents: 800 } };

  it("reprennent exactement les valeurs des réglages de chaque pack", () => {
    for (const plan of cards) {
      const card = planCardContent(plan, cards, { ...options, salesOpen: true });
      expect(card.name).toBe(plan.name.fr);
      expect(card.description).toBe(plan.description?.fr);
      expect(card.price).toBe(formatMoney(plan.priceCents, "EUR", "fr"));
      expect(card.highlights).toEqual(
        planHighlights(plan, cards, NOTHING_SOON).map((line) => ({
          text:
            line.key === "everythingIn"
              ? t("highlights.everythingIn", {
                  plan: cards.find((item) => item.code === line.values?.planCode)!.name.fr!,
                })
              : t(`highlights.${line.key}`, line.values),
          soon: false,
        })),
      );
      expect(card.highlights.length).toBeLessThanOrEqual(MAX_HIGHLIGHTS);
    }
  });

  it("affichent les prix de la grille des six packs", () => {
    const prices = Object.fromEntries(
      cards.map((plan) => [plan.code, planCardContent(plan, cards, { ...options, salesOpen: true }).price]),
    );
    const money = (cents: number) => formatMoney(cents, "EUR", "fr");
    expect(prices).toEqual({
      basic: money(0),
      essentiel: money(3999),
      serenite: money(7900),
      express: money(900),
      vitrine: money(2200),
      signature: money(4900),
    });
  });

  it("annoncent les nombres réglés (photos, réservations, SMS) dans le texte", () => {
    const vitrine = cards.find((plan) => plan.code === "vitrine")!;
    const card = planCardContent(vitrine, cards, { ...options, salesOpen: true });
    expect(card.highlights.map((line) => line.text)).toContain("20 photos");
    const essentiel = cards.find((plan) => plan.code === "essentiel")!;
    expect(
      planCardContent(essentiel, cards, { ...options, salesOpen: true }).highlights.map((line) => line.text),
    ).toContain("100 SMS de rappel par mois");
  });

  it("mènent au formulaire « Être rappelé » tant que la vente en ligne est fermée", () => {
    const signature = cards.find((plan) => plan.code === "signature")!;
    const basic = cards.find((plan) => plan.code === "basic")!;
    expect(planCardContent(signature, cards, { ...options, salesOpen: false }).cta).toMatchObject({
      label: "Être rappelé",
      href: { pathname: "/rappel" },
    });
    expect(planCardContent(signature, cards, { ...options, salesOpen: true }).cta).toMatchObject({
      label: "Choisir Signature",
      href: { pathname: "/commander" },
    });
    expect(planCardContent(basic, cards, { ...options, salesOpen: false }).cta).toMatchObject({
      label: "Commencer gratuitement",
      href: { pathname: "/commander" },
    });
  });

  it("proposent d'ajouter la réservation en passant au jumeau", () => {
    const express = cards.find((plan) => plan.code === "express")!;
    expect(planCardContent(express, cards, { ...options, salesOpen: true }).addBooking).toContain(
      "Essentiel",
    );
  });
});
