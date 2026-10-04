import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Aperçu d'un site encore « en création », réservé à l'administratrice :
 * un jeton signé (valable 1 heure) ouvre le site pour ce navigateur seulement.
 * Le proxy peut le vérifier sans interroger la base.
 */

export const PREVIEW_COOKIE = "site_preview";
export const PREVIEW_PARAM = "apercu";
export const PREVIEW_TTL_SECONDS = 60 * 60;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`site-preview:${payload}`).digest("base64url");
}

export function createPreviewToken(tenantId: string, secret: string, now = Date.now()): string {
  const payload = `${tenantId}.${Math.floor(now / 1000) + PREVIEW_TTL_SECONDS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload, secret)}`;
}

export function verifyPreviewToken(
  token: string | undefined | null,
  tenantId: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const [id, expiry] = payload.split(".");
  return id === tenantId && Number(expiry) * 1000 > now;
}
