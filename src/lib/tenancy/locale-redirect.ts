import { isSupportedLocale, type Locale } from "@/i18n/locales";

/**
 * Domaines secondaires redirigés vers une langue du site commercial.
 * Format de configuration : "horaneo.fr=fr,horaneo.es=es".
 */
export function parseLocaleRedirectDomains(raw: string | undefined): Map<string, Locale> {
  const map = new Map<string, Locale>();
  for (const entry of (raw ?? "").split(",")) {
    const [domain, locale] = entry.split("=").map((part) => part?.trim().toLowerCase());
    if (domain && locale && isSupportedLocale(locale)) map.set(domain, locale);
  }
  return map;
}
