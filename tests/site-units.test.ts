import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/colors";
import { createPreviewToken, verifyPreviewToken } from "@/lib/tenancy/preview";
import { directionsUrl, formatDuration, isoWeekdayIn, osmEmbedUrl } from "@/modules/site/format";
import { renderSitemap, serializeJsonLd } from "@/modules/site/seo";
import { buildTheme, themeCssVariables } from "@/modules/site/theme";

describe("ambiances du site client", () => {
  const brands = [
    { primary: "#2f5d50", secondary: "#e7dcc8" },
    { primary: "#ffe066", secondary: "#fff8d6" }, // jaune très clair : texte du bouton à adapter
    { primary: "#111111", secondary: "#222222" }, // presque noir : à adapter en sombre
    { primary: "#e8503f", secondary: "#ffffff" },
  ];

  for (const key of ["light", "dark", "nature"] as const) {
    for (const brand of brands) {
      it(`${key} ${brand.primary} : titres, bouton et textes secondaires restent lisibles`, () => {
        const { colors } = buildTheme(key, brand);
        expect(contrastRatio(colors.accent, colors.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.button, colors.onButton)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.text, colors.bg)).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(colors.muted, colors.surface)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("garde la couleur du client quand elle est déjà lisible", () => {
    expect(buildTheme("light", { primary: "#2f5d50" }).colors.button).toBe("#2f5d50");
  });

  it("utilise des couleurs par défaut si le client n'en a pas", () => {
    expect(buildTheme("nature", undefined).colors.button).toMatch(/^#[0-9a-f]{6}$/);
    expect(buildTheme("light", { primary: "pas-une-couleur" }).colors.accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("produit des variables CSS propres au site (jamais celles du SaaS)", () => {
    const vars = themeCssVariables(buildTheme("dark", { primary: "#2f5d50" }));
    expect(Object.keys(vars).every((name) => name.startsWith("--site-"))).toBe(true);
  });
});

describe("aperçu d'un site en création", () => {
  const secret = "s".repeat(40);
  const tenant = "0190a0a0-0000-7000-8000-000000000001";

  it("accepte un jeton valide pour ce site uniquement", () => {
    const token = createPreviewToken(tenant, secret);
    expect(verifyPreviewToken(token, tenant, secret)).toBe(true);
    expect(verifyPreviewToken(token, "0190a0a0-0000-7000-8000-000000000002", secret)).toBe(false);
  });

  it("refuse un jeton expiré, falsifié ou signé avec une autre clé", () => {
    const now = Date.now();
    const token = createPreviewToken(tenant, secret, now);
    expect(verifyPreviewToken(token, tenant, secret, now + 2 * 60 * 60 * 1000)).toBe(false);
    expect(verifyPreviewToken(token.slice(0, -2) + "xx", tenant, secret)).toBe(false);
    expect(verifyPreviewToken(token, tenant, "t".repeat(40))).toBe(false);
    expect(verifyPreviewToken("n'importe-quoi", tenant, secret)).toBe(false);
    expect(verifyPreviewToken(null, tenant, secret)).toBe(false);
  });
});

describe("mises en forme du site", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    ({
      durationMinutes: `${values?.minutes} min`,
      durationHours: `${values?.hours} h`,
      durationHoursMinutes: `${values?.hours} h ${values?.minutes}`,
    })[key]!;

  it("affiche les durées comme on les dit", () => {
    expect(formatDuration(t, 45)).toBe("45 min");
    expect(formatDuration(t, 60)).toBe("1 h");
    expect(formatDuration(t, 75)).toBe("1 h 15");
    expect(formatDuration(t, 125)).toBe("2 h 05");
  });

  it("trouve le jour de la semaine dans le fuseau de l'établissement", () => {
    // Dimanche 23 h 30 à Paris = lundi 6 h 30 à Tokyo.
    const instant = new Date("2026-10-04T21:30:00Z");
    expect(isoWeekdayIn("Europe/Paris", instant)).toBe(7);
    expect(isoWeekdayIn("Asia/Tokyo", instant)).toBe(1);
  });

  it("construit les liens d'itinéraire et de plan", () => {
    expect(directionsUrl(["Spa", "8 quai", null, "69002 Lyon"])).toContain(
      "Spa%2C%208%20quai%2C%2069002%20Lyon",
    );
    expect(osmEmbedUrl(45.7627, 4.8314)).toContain("marker=45.76270,4.83140");
  });
});

describe("référencement", () => {
  it("échappe le JSON-LD pour qu'il ne puisse pas fermer la balise script", () => {
    expect(serializeJsonLd({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });

  it("produit un plan du site valide", () => {
    const xml = renderSitemap(
      "https://institut.fr",
      ["/", "/prestations", "/a&b"],
      new Date("2026-10-04T00:00:00Z"),
    );
    expect(xml).toContain("<loc>https://institut.fr</loc>");
    expect(xml).toContain("<loc>https://institut.fr/prestations</loc>");
    expect(xml).toContain("/a&amp;b");
  });
});
