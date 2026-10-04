import { describe, expect, it } from "vitest";
import { localeRedirectTarget, normalizeHost, parseLocaleRedirectDomains } from "@/lib/locale-redirect";

const domains = parseLocaleRedirectDomains("horaneo.fr=fr, horaneo.es=es, bad=xx");

describe("redirection horaneo.fr → horaneo.com/fr", () => {
  it("lit la configuration en ignorant les langues inconnues", () => {
    expect([...domains.entries()]).toEqual([
      ["horaneo.fr", "fr"],
      ["horaneo.es", "es"],
    ]);
  });

  it("normalise le nom d'hôte", () => {
    expect(normalizeHost("WWW.Horaneo.FR:443")).toBe("horaneo.fr");
  });

  it("redirige la page d'accueil", () => {
    expect(localeRedirectTarget(new URL("https://horaneo.fr/"), "horaneo.fr", domains, "horaneo.com")).toBe(
      "https://horaneo.com/fr",
    );
  });

  it("conserve le chemin et les paramètres", () => {
    expect(
      localeRedirectTarget(
        new URL("https://www.horaneo.fr/tarifs?x=1"),
        "www.horaneo.fr",
        domains,
        "horaneo.com",
      ),
    ).toBe("https://horaneo.com/fr/tarifs?x=1");
  });

  it("ne touche pas aux autres domaines", () => {
    expect(
      localeRedirectTarget(new URL("https://horaneo.com/fr"), "horaneo.com", domains, "horaneo.com"),
    ).toBeNull();
    expect(
      localeRedirectTarget(new URL("https://institut.fr/"), "institut.fr", domains, "horaneo.com"),
    ).toBeNull();
  });
});
