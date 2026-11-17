import "server-only";
import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { authSecret } from "@/config/env";
import { withPlatform } from "@/db/access";
import { appDb, type Database } from "@/db/client";
import { authVerifications } from "@/db/schema";

/**
 * Code de connexion à 6 chiffres, envoyé dans le même e-mail que le lien magique :
 * on peut lire l'e-mail sur son téléphone et se connecter sur un autre appareil.
 *
 * Le jeton du lien se recalcule à partir d'un identifiant de demande (clé du
 * serveur) et le code se déduit du jeton : rien de secret n'est conservé en clair.
 * Saisir le bon code revient à ouvrir le lien (même vérification, même session).
 */

export const LOGIN_CODE_MAX_ATTEMPTS = 5;
/**
 * Mauvais codes permis par adresse et par heure, toutes demandes confondues : redemander
 * un e-mail ne redonne pas d'essais au-delà (pas de recherche du code par force brute).
 * Le lien de l'e-mail, lui, reste utilisable.
 */
export const LOGIN_CODE_MAX_FAILURES_PER_HOUR = 15;
const HOUR_MS = 60 * 60 * 1000;

type PendingCode = {
  requestId: string;
  attempts: number;
  /** Mauvais codes des demandes précédentes de l'heure en cours. */
  failures?: number;
  /** Début de l'heure en cours (millisecondes). */
  since?: number;
  /** Trop de mauvais codes pour cette demande : code refusé, lien seul utilisable. */
  locked?: boolean;
};

const identifierFor = (email: string) => `login-code:${email.trim().toLowerCase()}`;

function loginKey() {
  return Buffer.from(hkdfSync("sha256", authSecret(), "login-code", "v1", 32));
}

function linkTokenFor(requestId: string) {
  return createHmac("sha256", loginKey()).update(`link:${requestId}`).digest("base64url").slice(0, 32);
}

/** Code à 6 chiffres associé au jeton d'un lien magique. */
export function loginCodeFor(token: string) {
  const digest = createHmac("sha256", loginKey()).update(`code:${token}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/**
 * Jeton du lien magique (appelé par Better Auth à chaque demande) : la demande
 * est notée pour l'adresse, et remplace la précédente.
 */
export async function createLinkToken(email: string, ttlSeconds: number, database: Database = appDb()) {
  const requestId = randomUUID();
  const identifier = identifierFor(email);
  await withPlatform(async (tx) => {
    // Mauvais codes de l'heure en cours reportés sur la nouvelle demande.
    const [previous] = await tx
      .select()
      .from(authVerifications)
      .where(eq(authVerifications.identifier, identifier))
      .orderBy(desc(authVerifications.createdAt))
      .limit(1)
      .for("update");
    const before = previous ? (JSON.parse(previous.value) as PendingCode) : null;
    const now = Date.now();
    const sameHour = before?.since !== undefined && now - before.since < HOUR_MS;
    const failures = sameHour ? (before.failures ?? 0) + before.attempts : 0;
    const since = sameHour ? before.since! : now;
    await tx.delete(authVerifications).where(eq(authVerifications.identifier, identifier));
    await tx.insert(authVerifications).values({
      identifier,
      value: JSON.stringify({ requestId, attempts: 0, failures, since } satisfies PendingCode),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
  }, database);
  return linkTokenFor(requestId);
}

export type LoginCodeResult = { ok: true; token: string } | { ok: false; reason: "invalid" | "locked" };

/**
 * Vérifie le code saisi pour une adresse. Bon code : le jeton du lien (à faire
 * ouvrir par le navigateur). Mauvais code : un essai de moins ; au-delà, la
 * demande est annulée et il faut un nouvel e-mail.
 */
export async function checkLoginCode(
  email: string,
  code: string,
  database: Database = appDb(),
): Promise<LoginCodeResult> {
  const identifier = identifierFor(email);
  const typed = code.replace(/\D/g, "");
  return withPlatform(async (tx) => {
    const [row] = await tx
      .select()
      .from(authVerifications)
      .where(and(eq(authVerifications.identifier, identifier), gt(authVerifications.expiresAt, new Date())))
      .orderBy(desc(authVerifications.createdAt))
      .limit(1)
      .for("update");
    if (!row) return { ok: false, reason: "invalid" };
    const pending = JSON.parse(row.value) as PendingCode;
    if (pending.locked || (pending.failures ?? 0) + pending.attempts >= LOGIN_CODE_MAX_FAILURES_PER_HOUR)
      return { ok: false, reason: "locked" };
    const token = linkTokenFor(pending.requestId);
    const expected = Buffer.from(loginCodeFor(token));
    const given = Buffer.from(typed.padEnd(6, "x").slice(0, 6));
    if (typed.length === 6 && timingSafeEqual(expected, given)) {
      await tx.delete(authVerifications).where(eq(authVerifications.id, row.id));
      return { ok: true, token };
    }
    const attempts = pending.attempts + 1;
    if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
      // Gardée (verrouillée) : ses mauvais codes comptent pour la prochaine demande.
      await tx
        .update(authVerifications)
        .set({ value: JSON.stringify({ ...pending, attempts, locked: true } satisfies PendingCode) })
        .where(eq(authVerifications.id, row.id));
      return { ok: false, reason: "locked" };
    }
    await tx
      .update(authVerifications)
      .set({ value: JSON.stringify({ ...pending, attempts } satisfies PendingCode) })
      .where(eq(authVerifications.id, row.id));
    return { ok: false, reason: "invalid" };
  }, database);
}
