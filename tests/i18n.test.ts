import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEnabledLocales } from "@/i18n/enabled";
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
