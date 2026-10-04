import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";
import { ADMIN_VERIFICATION_TTL_MS, decideAdminAccess } from "@/lib/auth/admin-access";
import { enabledSocialProviders, safeRedirectPath } from "@/lib/auth/providers";
import {
  consumeBackupCode,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  totpCodeAt,
  totpUri,
  verifyTotp,
} from "@/lib/auth/totp";
import { escapeHtml, renderActionEmail } from "@/lib/email/layout";
import { createRateLimiter } from "@/lib/rate-limit";

describe("moyens de connexion", () => {
  it("n'affiche Google et Apple que s'ils sont configurés", () => {
    expect(enabledSocialProviders(parseEnv({}))).toEqual([]);
    expect(enabledSocialProviders(parseEnv({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }))).toEqual([
      "google",
    ]);
    expect(
      enabledSocialProviders(
        parseEnv({
          GOOGLE_CLIENT_ID: "id",
          GOOGLE_CLIENT_SECRET: "s",
          APPLE_CLIENT_ID: "a",
          APPLE_CLIENT_SECRET: "b",
        }),
      ),
    ).toEqual(["google", "apple"]);
  });

  it("ignore un identifiant incomplet ou laissé vide", () => {
    expect(enabledSocialProviders(parseEnv({ APPLE_CLIENT_ID: "a", APPLE_CLIENT_SECRET: "" }))).toEqual([]);
  });

  it("refuse une clé secrète trop courte", () => {
    expect(() => parseEnv({ BETTER_AUTH_SECRET: "court" })).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe("adresse de retour après connexion", () => {
  it("accepte un chemin interne", () => {
    expect(safeRedirectPath("/espace", "/x")).toBe("/espace");
    expect(safeRedirectPath("/admin?onglet=1", "/x")).toBe("/admin?onglet=1");
  });

  it("refuse toute adresse externe", () => {
    for (const value of [
      "https://pirate.example",
      "//pirate.example",
      "/\\pirate.example",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(safeRedirectPath(value, "/espace")).toBe("/espace");
    }
  });
});

describe("accès à l'espace admin", () => {
  const now = new Date("2026-10-04T12:00:00Z");

  it("répond « introuvable » à qui n'est pas administratrice", () => {
    expect(
      decideAdminAccess({ isPlatformAdmin: false, twoFactorConfirmed: true, sessionVerifiedAt: now, now }),
    ).toBe("not_found");
  });

  it("exige la mise en place de la double vérification", () => {
    expect(
      decideAdminAccess({ isPlatformAdmin: true, twoFactorConfirmed: false, sessionVerifiedAt: null, now }),
    ).toBe("setup_required");
  });

  it("exige un code pour chaque session, renouvelé toutes les 12 heures", () => {
    expect(
      decideAdminAccess({ isPlatformAdmin: true, twoFactorConfirmed: true, sessionVerifiedAt: null, now }),
    ).toBe("verification_required");
    const old = new Date(now.getTime() - ADMIN_VERIFICATION_TTL_MS - 1);
    expect(
      decideAdminAccess({ isPlatformAdmin: true, twoFactorConfirmed: true, sessionVerifiedAt: old, now }),
    ).toBe("verification_required");
    expect(
      decideAdminAccess({ isPlatformAdmin: true, twoFactorConfirmed: true, sessionVerifiedAt: now, now }),
    ).toBe("granted");
  });
});

describe("codes à 6 chiffres", () => {
  const secret = generateTotpSecret();
  const now = Date.UTC(2026, 9, 4, 12, 0, 0);

  it("accepte le code du moment", () => {
    expect(verifyTotp(secret, totpCodeAt(secret, now), null, now)).not.toBeNull();
  });

  it("tolère un décalage d'horloge de 30 secondes, pas plus", () => {
    expect(verifyTotp(secret, totpCodeAt(secret, now - 30_000), null, now)).not.toBeNull();
    expect(verifyTotp(secret, totpCodeAt(secret, now - 120_000), null, now)).toBeNull();
  });

  it("refuse un code déjà utilisé", () => {
    const code = totpCodeAt(secret, now);
    const step = verifyTotp(secret, code, null, now)!;
    expect(verifyTotp(secret, code, step, now)).toBeNull();
  });

  it("refuse un format invalide et un mauvais code", () => {
    expect(verifyTotp(secret, "abc123", null, now)).toBeNull();
    const wrong = String((Number(totpCodeAt(secret, now)) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotp(secret, wrong, null, now)).toBeNull();
  });

  it("produit une adresse lisible par les applications", () => {
    expect(totpUri(secret, "admin@example.com", "Horaneo admin")).toMatch(/^otpauth:\/\/totp\/.*secret=/);
  });
});

describe("chiffrement du secret", () => {
  const key = "x".repeat(40);

  it("déchiffre ce qu'il a chiffré", () => {
    expect(decryptSecret(encryptSecret("JBSWY3DPEHPK3PXP", key), key)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("ne stocke jamais le secret en clair et change à chaque chiffrement", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(a).not.toContain("JBSWY3DPEHPK3PXP");
    expect(encryptSecret("JBSWY3DPEHPK3PXP", key)).not.toBe(a);
  });

  it("refuse une autre clé ou un contenu altéré", () => {
    const payload = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(() => decryptSecret(payload, "y".repeat(40))).toThrow();
    expect(() => decryptSecret(payload.slice(0, -2) + "AA", key)).toThrow();
  });
});

describe("codes de secours", () => {
  it("génère 8 codes distincts et n'en garde que les empreintes", () => {
    const { codes, hashes } = generateBackupCodes();
    expect(new Set(codes).size).toBe(8);
    expect(hashes.join()).not.toContain(codes[0]);
  });

  it("chaque code ne sert qu'une fois, sans tenir compte des majuscules", () => {
    const { codes, hashes } = generateBackupCodes();
    const remaining = consumeBackupCode(codes[2].toUpperCase(), hashes);
    expect(remaining).toHaveLength(7);
    expect(consumeBackupCode(codes[2], remaining!)).toBeNull();
    expect(consumeBackupCode("faux-code", hashes)).toBeNull();
  });
});

describe("limitation des tentatives", () => {
  it("bloque au-delà du maximum puis libère après la fenêtre", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.attempt("a", 0)).toBe(true);
    expect(limiter.attempt("a", 100)).toBe(true);
    expect(limiter.attempt("a", 200)).toBe(false);
    expect(limiter.attempt("b", 200)).toBe(true);
    expect(limiter.attempt("a", 1200)).toBe(true);
  });
});

describe("e-mail avec bouton", () => {
  it("échappe les textes insérés dans le HTML", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    const { html, text } = renderActionEmail({
      locale: "fr",
      brandName: "<b>Marque</b>",
      title: "Titre",
      paragraphs: ["Bonjour"],
      action: { label: "Ouvrir", url: "https://horaneo.com/x?a=1&b=2" },
      footer: "Pied",
    });
    expect(html).not.toContain("<b>Marque</b>");
    expect(html).toContain("https://horaneo.com/x?a=1&amp;b=2");
    expect(text).toContain("Ouvrir : https://horaneo.com/x?a=1&b=2");
  });
});
