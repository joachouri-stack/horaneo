import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./locales";

/**
 * Langues activées, lues dans ENABLED_LOCALES au moment de la construction
 * (voir next.config.ts, qui vérifie aussi que chaque fichier de traduction existe).
 */
export function parseEnabledLocales(raw: string | undefined): Locale[] {
  const list = (raw ?? DEFAULT_LOCALE)
    .split(",")
    .map((item) => item.trim())
    .filter(isSupportedLocale);
  const unique = Array.from(new Set<Locale>([DEFAULT_LOCALE, ...list]));
  return unique;
}

export const ENABLED_LOCALES = parseEnabledLocales(process.env.NEXT_PUBLIC_ENABLED_LOCALES);
