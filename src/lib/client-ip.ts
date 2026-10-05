import "server-only";
import { env } from "@/config/env";

/**
 * Adresse IP du visiteur, pour la limitation des tentatives et le journal admin.
 * En-tête configuré (CLIENT_IP_HEADERS). Dans X-Forwarded-For, le visiteur peut
 * écrire ce qu'il veut au début : seule la dernière valeur, ajoutée par notre
 * propre proxy, est fiable. Derrière Cloudflare, configurer cf-connecting-ip.
 */
export function clientIp(requestHeaders: Headers): string | null {
  const header = env().CLIENT_IP_HEADERS.split(",")[0].trim().toLowerCase();
  const values = (requestHeaders.get(header) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const ip = values.at(-1);
  return ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}
