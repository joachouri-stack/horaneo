import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";
import { DEFAULT_PLANS, DEFAULT_PLATFORM_SETTINGS, DEFAULT_SITE_ONLY_PLANS } from "@/config/defaults";

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

  it("reprend les prix du brief", () => {
    expect(byCode.basic.priceCents).toBe(0);
    expect(byCode.essentiel.priceCents).toBe(3999);
    expect(byCode.serenite.priceCents).toBe(6900);
  });

  it("propose trois packs « site seul », sans réservation, Signature avec frais de création", () => {
    const site = Object.fromEntries(DEFAULT_SITE_ONLY_PLANS.map((plan) => [plan.code, plan]));
    expect([site.express.priceCents, site.vitrine.priceCents, site.signature.priceCents]).toEqual([
      900, 2200, 3900,
    ]);
    expect(site.signature.setupFeeCents).toBe(29000);
    for (const plan of DEFAULT_SITE_ONLY_PLANS) expect(plan.features.onlineBooking).toBe(false);
    for (const plan of DEFAULT_PLANS) expect(plan.features.onlineBooking).toBe(true);
  });

  it("ne propose jamais de SMS illimités", () => {
    for (const plan of [...DEFAULT_PLANS, ...DEFAULT_SITE_ONLY_PLANS]) {
      expect(typeof plan.limits.smsPerMonth).toBe("number");
    }
  });

  it("limite le Basic à 5 réservations en ligne par mois", () => {
    expect(byCode.basic.limits.onlineBookingsPerMonth).toBe(5);
    expect(byCode.basic.features.brandingFooter).toBe(true);
    expect(byCode.basic.features.onlinePayment).toBe(false);
  });

  it("prévoit les réglages encore ouverts", () => {
    expect(DEFAULT_PLATFORM_SETTINGS).toMatchObject({
      prices_display: "TTC",
      commitment_months: 12,
      setup_fee_cents: 0,
      deposit_commission_percent: 0,
    });
  });
});
