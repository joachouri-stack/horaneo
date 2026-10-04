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

/** Retire le port et le "www." d'un nom d'hôte. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "")
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

/**
 * Adresse de redirection pour un domaine secondaire, ou null si la requête
 * ne le concerne pas. Ex. horaneo.fr/tarifs → https://horaneo.com/fr/tarifs.
 */
export function localeRedirectTarget(
  url: URL,
  host: string | null,
  redirectDomains: Map<string, Locale>,
  mainDomain: string,
): string | null {
  const locale = redirectDomains.get(normalizeHost(host));
  if (!locale) return null;
  const path = url.pathname === "/" ? "" : url.pathname;
  return `https://${mainDomain}/${locale}${path}${url.search}`;
}
