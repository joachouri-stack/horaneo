import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";
import {
  DEFAULT_GRID_PLANS,
  DEFAULT_LAUNCH_OFFERS,
  DEFAULT_PLANS,
  DEFAULT_PLATFORM_SETTINGS,
  DEFAULT_SITE_ONLY_PLANS,
} from "@/config/defaults";

describe("configuration", () => {
  it("utilise Horaneo et horaneo.com comme valeurs de départ", () => {
    const env = parseEnv({});
    expect(env.PRODUCT_NAME).toBe("Horaneo");
    expect(env.MAIN_DOMAIN).toBe("horaneo.com");
    expect(env.ENABLED_LOCALES).toEqual(["fr"]);
  });

  it("permet de changer le nom et le domaine sans toucher au code", () => {
    const env = parseEnv({ PRODUCT_NAME: "Autre", MAIN_DOMAIN: "autre.test" });
    expect(env.PRODUCT_NAME).toBe("Autre");
    expect(env.MAIN_DOMAIN).toBe("autre.test");
  });

  it("accepte la clé secrète Stripe classique (sk_) ou limitée (rk_), refuse le reste", () => {
    expect(parseEnv({ STRIPE_SECRET_KEY: "sk_live_abc" }).STRIPE_SECRET_KEY).toBe("sk_live_abc");
    expect(parseEnv({ STRIPE_SECRET_KEY: "rk_live_abc" }).STRIPE_SECRET_KEY).toBe("rk_live_abc");
    expect(() => parseEnv({ STRIPE_SECRET_KEY: "pk_live_abc" })).toThrow(/Configuration invalide/);
  });

  it("lit la liste des langues activées", () => {
    expect(parseEnv({ ENABLED_LOCALES: "fr, en,es" }).ENABLED_LOCALES).toEqual(["fr", "en", "es"]);
  });

  it("refuse une langue inconnue", () => {
    expect(() => parseEnv({ ENABLED_LOCALES: "fr,de" })).toThrow(/Configuration invalide/);
  });

  it("exige la langue par défaut", () => {
    expect(() => parseEnv({ ENABLED_LOCALES: "en" })).toThrow(/langue par défaut/);
  });

  it("refuse une adresse de base de données invalide", () => {
    expect(() => parseEnv({ DATABASE_URL: "pas-une-adresse" })).toThrow(/DATABASE_URL/);
  });
});

describe("valeurs de départ des packs", () => {
  const byCode = Object.fromEntries(DEFAULT_PLANS.map((plan) => [plan.code, plan]));

  const grid = Object.fromEntries(DEFAULT_GRID_PLANS.map((plan) => [plan.code, plan]));

  it("grille Basic, Pro, Business : prix de lancement hors taxes", () => {
    expect(DEFAULT_GRID_PLANS.map((plan) => [plan.code, plan.priceCents, plan.isPublic])).toEqual([
      ["basic", 0, true],
      ["pro", 3990, true],
      ["business", 7900, true],
    ]);
    expect(DEFAULT_PLATFORM_SETTINGS.prices_display).toBe("HT");
  });

  it("Basic : 10 réservations, 50 contacts, 10 photos, 1 utilisateur, sans SMS ni paiement", () => {
    expect(grid.basic.limits).toMatchObject({
      onlineBookingsPerMonth: 10,
      customers: 50,
      photos: 10,
      members: 1,
      smsPerMonth: 0,
    });
    expect(grid.basic.features).toMatchObject({ onlinePayment: false, customDomain: true });
    expect(grid.basic.features.aiChatbot).toBeFalsy();
  });

  it("Pro : 3 collaborateurs, 100 SMS, paiements ; Business : quotas des outils IA", () => {
    expect(grid.pro.limits).toMatchObject({ members: 3, smsPerMonth: 100, aiChatConversations: 0 });
    expect(grid.pro.features).toMatchObject({ onlinePayment: true, commerce: true, formation: true });
    expect(grid.business.limits).toMatchObject({
      members: null,
      smsPerMonth: 300,
      aiChatConversations: 500,
      whatsappConversations: 200,
      aiTexts: 100,
      aiImages: 20,
    });
  });

  it("chaque pack comprend tout le pack précédent", () => {
    for (const [lower, upper] of [
      [grid.basic, grid.pro],
      [grid.pro, grid.business],
    ]) {
      for (const [key, value] of Object.entries(lower.features))
        if (value && key !== "brandingFooter")
          expect(upper.features[key], `${upper.code} : ${key}`).toBe(true);
    }
  });

  it("annonce « Bientôt » les outils pas encore livrés, et l'offre tablette à places limitées", () => {
    for (const key of ["aiChatbot", "whatsappAssistant", "aiTexts", "aiImages", "commerce", "formation"])
      expect(DEFAULT_PLATFORM_SETTINGS.features_soon).toContain(key);
    expect(DEFAULT_LAUNCH_OFFERS[0]).toMatchObject({
      planCode: "business",
      quota: 100,
      requiresCommitment: true,
    });
    expect(DEFAULT_PLATFORM_SETTINGS.solutions.map((item) => [item.code, item.status])).toEqual([
      ["booking", "available"],
      ["commerce", "soon"],
      ["formation", "soon"],
    ]);
  });

  it("anciens packs (plus vendus) : prix d'origine", () => {
    expect(byCode.essentiel.priceCents).toBe(3999);
    expect(byCode.serenite.priceCents).toBe(7900);
  });

  it("propose trois packs « site seul », sans réservation, avec leurs frais de création sans engagement", () => {
    const site = Object.fromEntries(DEFAULT_SITE_ONLY_PLANS.map((plan) => [plan.code, plan]));
    expect([site.express.priceCents, site.vitrine.priceCents, site.signature.priceCents]).toEqual([
      900, 2200, 4900,
    ]);
    expect([site.express, site.vitrine, site.signature].map((plan) => plan.noCommitmentFeeCents)).toEqual([
      4900, 14900, 24900,
    ]);
    expect([byCode.essentiel, byCode.serenite].map((plan) => plan.noCommitmentFeeCents)).toEqual([
      14900, 24900,
    ]);
    for (const plan of DEFAULT_SITE_ONLY_PLANS) expect(plan.features.onlineBooking).toBe(false);
    for (const plan of DEFAULT_PLANS) expect(plan.features.onlineBooking).toBe(true);
  });

  it("ne propose jamais de SMS illimités", () => {
    for (const plan of [...DEFAULT_GRID_PLANS, ...DEFAULT_PLANS, ...DEFAULT_SITE_ONLY_PLANS]) {
      expect(typeof plan.limits.smsPerMonth).toBe("number");
    }
  });

  it("prévoit les réglages encore ouverts", () => {
    expect(DEFAULT_PLATFORM_SETTINGS).toMatchObject({
      commitment_months: 12,
      offer_no_commitment: true,
      price_change_notice_days: 30,
      site_buyout_enabled: false,
      deposit_commission_percent: 0,
    });
  });
});
