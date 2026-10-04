import type { Env } from "@/config/env";

/**
 * Moyens de connexion disponibles. Google et Apple ne s'activent que si leurs
 * identifiants sont configurés : Apple peut être ajouté plus tard sans rien bloquer.
 */
export type SocialProviderId = "google" | "apple";

export function enabledSocialProviders(config: Env): SocialProviderId[] {
  const providers: SocialProviderId[] = [];
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (config.APPLE_CLIENT_ID && config.APPLE_CLIENT_SECRET) providers.push("apple");
  return providers;
}

/**
 * Adresse de retour après connexion : uniquement un chemin interne au site
 * (jamais une adresse externe, pour empêcher les redirections piégées).
 */
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const url = new URL(value, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
