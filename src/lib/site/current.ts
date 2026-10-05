import "server-only";
import { cookies, headers } from "next/headers";
import { authSecret, env } from "@/config/env";
import { createRateLimiter } from "@/lib/rate-limit";
import { classifyHost } from "@/lib/tenancy/hosts";
import { PREVIEW_COOKIE, verifyPreviewToken } from "@/lib/tenancy/preview";
import { routeTenantHost } from "@/lib/tenancy/resolve";
import { buildHostConfig, lookup } from "@/lib/tenancy/runtime";
import { AppError } from "@/modules/errors";

/**
 * Tenant du site en cours, pour les actions du site public (réservation…).
 * Recalculé ici à partir du domaine et du cookie d'aperçu : aucun en-tête
 * fourni par le visiteur n'est cru sur parole.
 */
export async function currentSiteTenant(): Promise<{ tenantId: string; preview: boolean; ip: string }> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const classification = classifyHost(host, new URL("http://site.invalid/"), buildHostConfig());
  if (classification.kind !== "tenant") throw new AppError("not_found");
  const route = await routeTenantHost(classification.hostname, new URL("http://site.invalid/"), lookup);
  if (route.kind !== "site") throw new AppError("not_found");
  const preview = verifyPreviewToken(
    (await cookies()).get(PREVIEW_COOKIE)?.value,
    route.tenantId,
    authSecret(),
  );
  if (route.previewOnly && !preview) throw new AppError("not_found");
  const ipHeader = env().CLIENT_IP_HEADERS.split(",")[0].trim().toLowerCase();
  const ip = requestHeaders.get(ipHeader)?.split(",")[0]?.trim() || "inconnue";
  return { tenantId: route.tenantId, preview, ip };
}

/** Limites anti-abus des actions publiques (par adresse IP). */
export const publicLimits = {
  availability: createRateLimiter({ max: 120, windowMs: 60 * 1000 }),
  booking: createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 }),
  manage: createRateLimiter({ max: 30, windowMs: 10 * 60 * 1000 }),
  /** Essais de codes promo : limités pour empêcher de les deviner. */
  promo: createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 }),
  /** Espace des clientes : demandes de lien ou de code (par appareil, puis par adresse). */
  customerLogin: createRateLimiter({ max: 20, windowMs: 60 * 60 * 1000 }),
  customerIdentifier: createRateLimiter({ max: 5, windowMs: 60 * 60 * 1000 }),
  /** Saisie des codes SMS. */
  customerCode: createRateLimiter({ max: 15, windowMs: 10 * 60 * 1000 }),
};
