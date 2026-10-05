import { createHash, createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { authSecret } from "@/config/env";
import type { Transaction } from "@/db/client";
import { customerLoginCodes, customerSessions, plans, tenants, usageCounters } from "@/db/schema";
import type { PlanLimits } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { normalizePhone } from "@/modules/phone";

/**
 * Connexion des clientes à leur espace, sans compte ni mot de passe : un lien
 * par e-mail ou un code par SMS, à usage unique et de courte durée. Le secret
 * se recalcule à partir de l'identifiant du code (clé du serveur) : il n'est
 * jamais conservé en clair, seulement son empreinte.
 */

export const CUSTOMER_LOGIN = {
  linkMinutes: 15,
  smsMinutes: 10,
  maxCodeAttempts: 5,
  /** Demandes de connexion par adresse (ou numéro) et par heure. */
  maxRequestsPerHour: 5,
  sessionDays: 30,
} as const;

export type CustomerChannel = "email" | "sms";
export type CustomerIdentity = { channel: CustomerChannel; identifier: string };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** E-mail (en minuscules) ou téléphone (format international), selon la saisie. */
export function parseIdentifier(raw: string, country: string): CustomerIdentity {
  const value = raw.trim();
  if (value.includes("@")) {
    const email = value.toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new AppError("invalid", "identifier");
    return { channel: "email", identifier: email };
  }
  const phone = normalizePhone(value, country, "identifier");
  if (!phone) throw new AppError("invalid", "identifier");
  return { channel: "sms", identifier: phone };
}

function loginKey() {
  return Buffer.from(hkdfSync("sha256", authSecret(), "customer-login", "v1", 32));
}

/** Lien de connexion (e-mail) : 32 caractères ; code SMS : 6 chiffres. */
export function loginSecretFor(codeId: string, channel: CustomerChannel): string {
  const digest = createHmac("sha256", loginKey()).update(`${channel}:${codeId}`).digest();
  if (channel === "email") return digest.toString("base64url").slice(0, 32);
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

/** Empreinte conservée : le lien seul (il est unique), ou le code lié à sa demande. */
function secretHash(codeId: string, channel: CustomerChannel, secret: string) {
  return channel === "email" ? sha256(secret) : sha256(`${codeId}:${secret}`);
}

/** Le pack inclut des SMS et le quota du mois n'est pas atteint. */
export async function smsLoginAvailable(tx: Transaction, tenantId: string, period: string) {
  const [row] = await tx
    .select({ limits: plans.limits, sent: usageCounters.smsSent })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .leftJoin(usageCounters, and(eq(usageCounters.tenantId, tenants.id), eq(usageCounters.period, period)))
    .where(eq(tenants.id, tenantId));
  if (!row) return false;
  const limit = (row.limits as PlanLimits).smsPerMonth;
  if (limit === 0) return false;
  return limit === null || limit === undefined || (row.sent ?? 0) < limit;
}

/** Entreprises du site où l'adresse ou le numéro est connu (fonction sûre de la base). */
export async function knownBusinesses(tx: Transaction, tenantId: string, identity: CustomerIdentity) {
  const rows = await tx.execute<{ id: string }>(
    sql`SELECT app_customer_businesses(${tenantId}::uuid, ${identity.channel}, ${identity.identifier}) AS id`,
  );
  return rows.map((row) => row.id);
}

/**
 * Crée un lien ou un code et l'ajoute à la file d'envoi (entreprise déclarée :
 * une de celles où la cliente est connue). Rien n'est créé au-delà de la limite
 * de demandes : l'appelant affiche le même message dans tous les cas.
 */
export async function issueLoginCode(
  tx: Transaction,
  tenantId: string,
  identity: CustomerIdentity,
  options: { businessId: string; locale: string; now?: Date },
) {
  const now = options.now ?? new Date();
  const [{ recent }] = await tx
    .select({ recent: sql<number>`count(*)::int` })
    .from(customerLoginCodes)
    .where(
      and(
        eq(customerLoginCodes.tenantId, tenantId),
        eq(customerLoginCodes.identifier, identity.identifier),
        gt(customerLoginCodes.createdAt, new Date(now.getTime() - 3_600_000)),
      ),
    );
  if (recent >= CUSTOMER_LOGIN.maxRequestsPerHour) return { issued: false as const };
  // Une seule demande valable à la fois : les précédentes ne servent plus.
  await tx
    .update(customerLoginCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(customerLoginCodes.tenantId, tenantId),
        eq(customerLoginCodes.identifier, identity.identifier),
        isNull(customerLoginCodes.usedAt),
      ),
    );
  const id = randomUUID();
  const minutes = identity.channel === "email" ? CUSTOMER_LOGIN.linkMinutes : CUSTOMER_LOGIN.smsMinutes;
  await tx.insert(customerLoginCodes).values({
    id,
    tenantId,
    channel: identity.channel,
    identifier: identity.identifier,
    secretHash: secretHash(id, identity.channel, loginSecretFor(id, identity.channel)),
    expiresAt: new Date(now.getTime() + minutes * 60_000),
    createdAt: now,
  });
  await queueMessage(tx, {
    tenantId,
    businessId: options.businessId,
    template: identity.channel === "email" ? "customer.login_link" : "customer.login_code",
    locale: options.locale,
    data: { loginCodeId: id },
    dedupeKey: `customer.login:${id}`,
  });
  return { issued: true as const, id };
}

async function openSession(tx: Transaction, tenantId: string, identity: CustomerIdentity, now: Date) {
  const token = randomBytes(32).toString("base64url");
  await tx.insert(customerSessions).values({
    tenantId,
    channel: identity.channel,
    identifier: identity.identifier,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + CUSTOMER_LOGIN.sessionDays * 86_400_000),
    createdAt: now,
    lastSeenAt: now,
  });
  return token;
}

/** Lien reçu par e-mail : valable une fois, avant son expiration. Renvoie le jeton de session. */
export async function signInWithLink(tx: Transaction, tenantId: string, token: string, now = new Date()) {
  if (!LINK_TOKEN.test(token)) throw new AppError("login_invalid");
  const [code] = await tx
    .select()
    .from(customerLoginCodes)
    .where(
      and(
        eq(customerLoginCodes.tenantId, tenantId),
        eq(customerLoginCodes.secretHash, sha256(token)),
        eq(customerLoginCodes.channel, "email"),
      ),
    );
  if (!code || code.usedAt || code.expiresAt <= now) throw new AppError("login_invalid");
  const [used] = await tx
    .update(customerLoginCodes)
    .set({ usedAt: now })
    .where(and(eq(customerLoginCodes.id, code.id), isNull(customerLoginCodes.usedAt)))
    .returning({ id: customerLoginCodes.id });
  if (!used) throw new AppError("login_invalid");
  return openSession(tx, tenantId, code, now);
}

/**
 * Code reçu par SMS : dernière demande du numéro, 5 essais au plus, valable une
 * fois. Un code faux renvoie null (sans erreur) pour que l'essai soit bien
 * compté : l'appelant affiche alors « code invalide ».
 */
export async function signInWithCode(
  tx: Transaction,
  tenantId: string,
  phone: string,
  code: string,
  now = new Date(),
) {
  const entered = code.replace(/\D/g, "");
  const [row] = await tx
    .select()
    .from(customerLoginCodes)
    .where(
      and(
        eq(customerLoginCodes.tenantId, tenantId),
        eq(customerLoginCodes.identifier, phone),
        eq(customerLoginCodes.channel, "sms"),
        isNull(customerLoginCodes.usedAt),
      ),
    )
    .orderBy(desc(customerLoginCodes.createdAt))
    .limit(1);
  if (!row || row.expiresAt <= now || row.failedAttempts >= CUSTOMER_LOGIN.maxCodeAttempts)
    throw new AppError("login_invalid");
  const expected = Buffer.from(row.secretHash);
  const actual = Buffer.from(secretHash(row.id, "sms", entered));
  if (entered.length !== 6 || !timingSafeEqual(expected, actual)) {
    await tx
      .update(customerLoginCodes)
      .set({ failedAttempts: sql`${customerLoginCodes.failedAttempts} + 1` })
      .where(eq(customerLoginCodes.id, row.id));
    return null;
  }
  await tx.update(customerLoginCodes).set({ usedAt: now }).where(eq(customerLoginCodes.id, row.id));
  return openSession(tx, tenantId, row, now);
}

/** Session d'une cliente (cookie) : null si inconnue, expirée ou fermée. */
export async function readSession(tx: Transaction, tenantId: string, token: string | undefined, now = new Date()) {
  if (!token || token.length > 100) return null;
  const [session] = await tx
    .select()
    .from(customerSessions)
    .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenHash, sha256(token))));
  if (!session || session.revokedAt || session.expiresAt <= now) return null;
  return { id: session.id, channel: session.channel, identifier: session.identifier } as CustomerIdentity & {
    id: string;
  };
}

export async function closeSession(tx: Transaction, tenantId: string, token: string | undefined, now = new Date()) {
  if (!token) return;
  await tx
    .update(customerSessions)
    .set({ revokedAt: now })
    .where(and(eq(customerSessions.tenantId, tenantId), eq(customerSessions.tokenHash, sha256(token))));
}

/** Code de connexion à préparer dans un message (au moment de l'envoi). */
export async function loginCodeForMessage(tx: Transaction, loginCodeId: string) {
  const [row] = await tx.select().from(customerLoginCodes).where(eq(customerLoginCodes.id, loginCodeId));
  if (!row) return null;
  return { ...row, secret: loginSecretFor(row.id, row.channel) };
}
