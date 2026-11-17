import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/config/env";

/**
 * Jeton de conversation du chatbot : remis à la première question (comptée dans le
 * quota du mois), puis renvoyé par le navigateur avec les suivantes. Sans jeton valable,
 * une question compte comme une nouvelle conversation : l'historique envoyé par le
 * navigateur ne suffit plus pour éviter le compteur. Rien n'est stocké.
 */

/** Durée de vie d'une conversation. */
export const CONVERSATION_TTL_MS = 60 * 60 * 1000;

function sign(payload: string) {
  const key = Buffer.from(hkdfSync("sha256", authSecret(), "chatbot-conversation", "v1", 32));
  return createHmac("sha256", key).update(payload).digest("base64url").slice(0, 32);
}

export function conversationToken(tenantId: string, now = new Date()) {
  const payload = `${now.getTime()}.${randomBytes(9).toString("base64url")}`;
  return `${payload}.${sign(`${tenantId}.${payload}`)}`;
}

/** Vrai si le jeton a été remis par ce site il y a moins d'une heure. */
export function isValidConversation(token: string, tenantId: string, now = new Date()) {
  const [issued, nonce, signature] = token.split(".");
  if (!issued || !nonce || !signature || !/^\d+$/.test(issued)) return false;
  const expected = Buffer.from(sign(`${tenantId}.${issued}.${nonce}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  const age = now.getTime() - Number(issued);
  return age >= 0 && age < CONVERSATION_TTL_MS;
}
