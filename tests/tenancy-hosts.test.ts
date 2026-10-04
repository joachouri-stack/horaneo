import { describe, expect, it } from "vitest";
import { classifyHost, cleanHost, isValidHostname, type HostConfig } from "@/lib/tenancy/hosts";
import { parseLocaleRedirectDomains } from "@/lib/tenancy/locale-redirect";

const config: HostConfig = {
  mainDomain: "horaneo.com",
  localeRedirectDomains: parseLocaleRedirectDomains("horaneo.fr=fr, horaneo.es=es, bad=xx"),
  devAliases: ["localhost"],
};

const classify = (host: string, path = "/") =>
  classifyHost(host, new URL(`https://example.test${path}`), config);

describe("lecture de la configuration des domaines de langue", () => {
  it("ignore les langues inconnues", () => {
    expect([...config.localeRedirectDomains.entries()]).toEqual([
      ["horaneo.fr", "fr"],
      ["horaneo.es", "es"],
    ]);
  });
});

describe("nettoyage des noms d'hôte", () => {
  it("retire port, majuscules et point final", () => {
    expect(cleanHost("Institut-Lea.FR:443")).toBe("institut-lea.fr");
    expect(cleanHost("horaneo.com.")).toBe("horaneo.com");
    expect(cleanHost(null)).toBe("");
  });

  it("refuse les noms invalides", () => {
    expect(isValidHostname("institut-lea.fr")).toBe(true);
    expect(isValidHostname("")).toBe(false);
    expect(isValidHostname("-bad.fr")).toBe(false);
    expect(isValidHostname("a..b")).toBe(false);
    expect(isValidHostname("évian.fr")).toBe(false);
  });
});

describe("reconnaissance du site selon le domaine", () => {
  it("horaneo.com → site commercial", () => {
    expect(classify("horaneo.com")).toEqual({ kind: "platform" });
    expect(classify("horaneo.com:443")).toEqual({ kind: "platform" });
  });

  it("www.horaneo.com → horaneo.com", () => {
    expect(classify("www.horaneo.com", "/fr?x=1")).toEqual({
      kind: "redirect",
      location: "https://horaneo.com/fr?x=1",
    });
  });

  it("horaneo.fr → horaneo.com/fr, en gardant le chemin", () => {
    expect(classify("horaneo.fr")).toEqual({ kind: "redirect", location: "https://horaneo.com/fr" });
    expect(classify("www.horaneo.fr", "/tarifs?x=1")).toEqual({
      kind: "redirect",
      location: "https://horaneo.com/fr/tarifs?x=1",
    });
  });

  it("nom.horaneo.com → site du client", () => {
    expect(classify("institut-lea.horaneo.com")).toEqual({
      kind: "tenant",
      hostname: "institut-lea.horaneo.com",
    });
  });

  it("refuse les sous-domaines réservés ou à plusieurs niveaux", () => {
    expect(classify("admin.horaneo.com")).toEqual({ kind: "unknown" });
    expect(classify("api.horaneo.com")).toEqual({ kind: "unknown" });
    expect(classify("a.b.horaneo.com")).toEqual({ kind: "unknown" });
  });

  it("domaine propre → site du client", () => {
    expect(classify("www.institut-lea.fr")).toEqual({ kind: "tenant", hostname: "www.institut-lea.fr" });
    expect(classify("Institut-Lea.fr")).toEqual({ kind: "tenant", hostname: "institut-lea.fr" });
  });

  it("refuse un en-tête Host invalide", () => {
    expect(classify("bad host")).toEqual({ kind: "unknown" });
    expect(classify("")).toEqual({ kind: "unknown" });
  });

  it("en développement, localhost joue le rôle du domaine principal", () => {
    expect(classify("localhost:3000")).toEqual({ kind: "platform" });
    expect(classify("institut-lea.localhost:3000")).toEqual({
      kind: "tenant",
      hostname: "institut-lea.horaneo.com",
    });
  });

  it("en production, localhost n'est pas reconnu comme domaine principal", () => {
    const prod = { ...config, devAliases: [] };
    expect(classifyHost("localhost", new URL("http://localhost/"), prod)).toEqual({
      kind: "tenant",
      hostname: "localhost",
    });
  });
});
