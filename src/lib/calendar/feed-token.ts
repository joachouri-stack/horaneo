import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/config/env";

/**
 * Lien secret de l'agenda d'une entreprise (abonnement depuis le téléphone).
 * Il porte l'établissement, l'entreprise et un numéro de version : en changer
 * (« nouveau lien ») rend l'ancien inutilisable, sans rien stocker d'autre.
 */

const UUID = /^[0-9a-f-]{36}$/i;

function sign(payload: string) {
  const key = Buffer.from(hkdfSync("sha256", authSecret(), "calendar-feed", "v1", 32));
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function calendarFeedToken(input: { tenantId: string; businessId: string; version: number }) {
  const payload = `${input.tenantId}.${input.businessId}.${input.version}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readCalendarFeedToken(token: string) {
  const [encoded, signature] = token.replace(/\.ics$/, "").split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString();
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [tenantId, businessId, rawVersion] = payload.split(".");
  const version = Number(rawVersion);
  if (!UUID.test(tenantId ?? "") || !UUID.test(businessId ?? "") || !Number.isInteger(version) || version < 1)
    return null;
  return { tenantId, businessId, version };
}
