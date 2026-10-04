/**
 * Langues prévues par le produit. Une langue n'est proposée aux visiteurs que si
 * elle est aussi listée dans ENABLED_LOCALES et possède son fichier messages/<langue>.json.
 */
export const SUPPORTED_LOCALES = ["fr", "en", "es", "ru"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Texte traduisible stocké en base : { "fr": "Soin visage", "en": "Facial" }. */
export type LocalizedText = Partial<Record<Locale, string>>;

/** Lit un texte traduisible dans la langue demandée, sinon dans la langue de repli. */
export function pickLocalized(
  text: LocalizedText | null | undefined,
  locale: Locale,
  fallback: Locale = DEFAULT_LOCALE,
): string {
  if (!text) return "";
  return text[locale] ?? text[fallback] ?? Object.values(text).find(Boolean) ?? "";
}
