import { env, publicAppUrl } from "@/config/env";

/**
 * Adresse publique d'un site client. En développement, nom.horaneo.com devient
 * nom.localhost:<port> pour pouvoir l'ouvrir sur sa machine.
 */
export function tenantSiteUrl(hostname: string): string {
  const config = env();
  if (config.NODE_ENV === "production") return `https://${hostname}`;
  const app = new URL(publicAppUrl());
  const local = hostname.endsWith(`.${config.MAIN_DOMAIN}`)
    ? `${hostname.slice(0, -config.MAIN_DOMAIN.length)}localhost`
    : hostname;
  return `${app.protocol}//${local}${app.port ? `:${app.port}` : ""}`;
}
