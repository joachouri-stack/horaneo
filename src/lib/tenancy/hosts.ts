import { RESERVED_SUBDOMAINS } from "@/config/reserved";
import type { Locale } from "@/i18n/locales";

/**
 * Classe une requête selon son nom de domaine, sans accès à la base :
 * - platform : le site commercial (horaneo.com)
 * - redirect : une adresse à rediriger (www.horaneo.com, horaneo.fr…)
 * - tenant   : le site d'un client, à retrouver en base par son nom d'hôte
 * - unknown  : un sous-domaine réservé ou invalide
 */
export type HostClassification =
  | { kind: "platform" }
  | { kind: "redirect"; location: string }
  | { kind: "tenant"; hostname: string }
  | { kind: "unknown" };

export type HostConfig = {
  mainDomain: string;
  localeRedirectDomains: Map<string, Locale>;
  /** En développement, "localhost" joue le rôle du domaine principal (nom.localhost → nom.horaneo.com). */
  devAliases: string[];
};

/** Minuscules, sans port ni point final. */
export function cleanHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidHostname(host: string): boolean {
  return host.length > 0 && host.length <= 253 && host.split(".").every((label) => LABEL.test(label));
}

export function classifyHost(rawHost: string | null, url: URL, config: HostConfig): HostClassification {
  const host = cleanHost(rawHost);
  const main = config.mainDomain;
  const path = url.pathname === "/" ? "" : url.pathname;

  // horaneo.fr (avec ou sans www) → horaneo.com/fr
  const redirectLocale = config.localeRedirectDomains.get(host.replace(/^www\./, ""));
  if (redirectLocale) {
    return { kind: "redirect", location: `https://${main}/${redirectLocale}${path}${url.search}` };
  }

  if (!isValidHostname(host)) return { kind: "unknown" };

  for (const base of [main, ...config.devAliases]) {
    if (host === base) return { kind: "platform" };
    if (host === `www.${base}` && base === main) {
      return { kind: "redirect", location: `https://${main}${url.pathname}${url.search}` };
    }
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -(base.length + 1));
      if (sub.includes(".") || RESERVED_SUBDOMAINS.has(sub)) return { kind: "unknown" };
      // Les sous-domaines sont enregistrés en base sous leur forme définitive.
      return { kind: "tenant", hostname: `${sub}.${main}` };
    }
  }

  // Tout autre nom : domaine propre d'un client.
  return { kind: "tenant", hostname: host };
}
