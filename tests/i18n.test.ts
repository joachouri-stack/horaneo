import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnabledLocales } from "@/i18n/enabled";
import { platformLocaleRedirect } from "@/i18n/redirects";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, pickLocalized } from "@/i18n/locales";
import { withFallback, type Messages } from "@/i18n/messages";

const messagesDir = path.join(__dirname, "..", "messages");

function read(locale: string): Messages {
  return JSON.parse(readFileSync(path.join(messagesDir, `${locale}.json`), "utf8"));
}

function keys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === "object" ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe("fichiers de traduction", () => {
  const files = readdirSync(messagesDir).filter((file) => file.endsWith(".json"));
  const reference = keys(read(DEFAULT_LOCALE));

  it("contient le français, langue par défaut", () => {
    expect(files).toContain(`${DEFAULT_LOCALE}.json`);
    expect(reference.length).toBeGreaterThan(0);
  });

  it("ne contient que des langues prévues", () => {
    for (const file of files) {
      expect(SUPPORTED_LOCALES).toContain(file.replace(".json", ""));
    }
  });

  it("nomme chaque langue prévue dans le sélecteur", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(reference).toContain(`languages.${locale}`);
    }
  });

  for (const file of files.filter((f) => f !== `${DEFAULT_LOCALE}.json`)) {
    it(`${file} n'a aucune clé absente du français`, () => {
      const extra = keys(read(file.replace(".json", ""))).filter((key) => !reference.includes(key));
      expect(extra).toEqual([]);
    });
  }

  it("aucun texte vide en français", () => {
    const walk = (messages: Messages): string[] =>
      Object.values(messages).flatMap((value) => (typeof value === "object" ? walk(value) : [value]));
    expect(walk(read(DEFAULT_LOCALE)).filter((text) => text.trim() === "")).toEqual([]);
  });
});

describe("outils de traduction", () => {
  it("complète une langue partielle avec le français", () => {
    const merged = withFallback({ a: { b: "B-en" } }, { a: { b: "B-fr", c: "C-fr" }, d: "D-fr" });
    expect(merged).toEqual({ a: { b: "B-en", c: "C-fr" }, d: "D-fr" });
  });

  it("lit un texte traduisible avec repli", () => {
    const text = { fr: "Soin visage", en: "Facial" };
    expect(pickLocalized(text, "en")).toBe("Facial");
    expect(pickLocalized(text, "ru")).toBe("Soin visage");
    expect(pickLocalized({ es: "Facial" }, "ru")).toBe("Facial");
    expect(pickLocalized(null, "fr")).toBe("");
  });

  it("garde toujours le français dans les langues activées", () => {
    expect(parseEnabledLocales(undefined)).toEqual(["fr"]);
    expect(parseEnabledLocales("en,es")).toEqual(["fr", "en", "es"]);
    expect(parseEnabledLocales("fr,xx,ru")).toEqual(["fr", "ru"]);
  });
});

describe("adresses des langues du site commercial", () => {
  const go = (path: string) => platformLocaleRedirect(new URL(`https://horaneo.test${path}`), ["fr"]);

  it("mène la racine à la langue par défaut, pour de bon", () => {
    expect(go("/")).toMatchObject({ status: 308 });
    expect(go("/")?.url.pathname).toBe("/fr");
  });

  it("mène une langue pas encore ouverte vers la même page en français", () => {
    expect(go("/en")?.url.pathname).toBe("/fr");
    expect(go("/es/comparatif?x=1")?.url.href).toBe("https://horaneo.test/fr/comparatif?x=1");
    expect(go("/ru/")?.url.pathname).toBe("/fr");
    expect(go("/en")?.status).toBe(307);
  });

  it("laisse passer les langues ouvertes et les autres adresses", () => {
    expect(go("/fr/comparatif")).toBeNull();
    expect(go("/connexion")).toBeNull();
    expect(platformLocaleRedirect(new URL("https://horaneo.test/en"), ["fr", "en"])).toBeNull();
  });
});
