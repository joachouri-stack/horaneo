import type { ResolvedHostname } from "@/db/access";

/**
 * Décide quoi faire d'une requête arrivant sur le domaine d'un client :
 * afficher son site, rediriger vers son adresse principale, ou répondre 404.
 */
export type TenantRoute =
  /** previewOnly : site en création, visible seulement avec un aperçu admin. */
  | { kind: "site"; tenantId: string; previewOnly: boolean }
  | { kind: "redirect"; location: string }
  | { kind: "not_found" };

type Lookup = (hostname: string) => Promise<ResolvedHostname | null>;

/** Sites visibles du public. Un site résilié reste en ligne pendant la période de conservation. */
const VISIBLE_STATUSES = new Set<ResolvedHostname["tenantStatus"]>(["active", "suspended", "cancelled"]);

function alternateHostname(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
}

export async function routeTenantHost(hostname: string, url: URL, lookup: Lookup): Promise<TenantRoute> {
  let requested = hostname;
  let found = await lookup(hostname);
  // institut-lea.fr et www.institut-lea.fr mènent au même site.
  if (!found) {
    requested = alternateHostname(hostname);
    found = await lookup(requested);
  }
  if (!found || (!VISIBLE_STATUSES.has(found.tenantStatus) && found.tenantStatus !== "draft")) {
    return { kind: "not_found" };
  }

  const canonical = found.primaryHostname ?? found.hostname;
  if (canonical !== hostname) {
    return { kind: "redirect", location: `https://${canonical}${url.pathname}${url.search}` };
  }
  return { kind: "site", tenantId: found.tenantId, previewOnly: found.tenantStatus === "draft" };
}

/**
 * Mémoire courte des domaines déjà reconnus, pour ne pas interroger la base
 * à chaque requête. Un changement de domaine est pris en compte en moins
 * d'une minute.
 */
export function cachedLookup(
  lookup: Lookup,
  { ttlMs = 60_000, missTtlMs = 10_000, maxEntries = 5_000 } = {},
) {
  const cache = new Map<string, { value: ResolvedHostname | null; expiresAt: number }>();
  return async (hostname: string) => {
    const now = Date.now();
    const hit = cache.get(hostname);
    if (hit && hit.expiresAt > now) return hit.value;
    const value = await lookup(hostname);
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
    cache.set(hostname, { value, expiresAt: now + (value ? ttlMs : missTtlMs) });
    return value;
  };
}
