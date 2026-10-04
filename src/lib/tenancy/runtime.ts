import { env } from "@/config/env";
import { resolveHostname } from "@/db/access";
import type { HostConfig } from "./hosts";
import { parseLocaleRedirectDomains } from "./locale-redirect";
import { cachedLookup } from "./resolve";

/** Configuration des domaines, partagée par le proxy et les actions du site public. */
export function buildHostConfig(): HostConfig {
  const config = env();
  return {
    mainDomain: config.MAIN_DOMAIN,
    localeRedirectDomains: parseLocaleRedirectDomains(config.LOCALE_REDIRECT_DOMAINS),
    devAliases: config.NODE_ENV === "production" ? [] : ["localhost"],
  };
}

/** Recherche des domaines avec mémoire courte (60 s). */
export const lookup = cachedLookup((hostname) => resolveHostname(hostname));
