import { and, eq, gt, sql } from "drizzle-orm";
import { authSecret } from "@/config/env";
import { withPlatform } from "@/db/access";
import type { Database } from "@/db/client";
import { adminTwoFactors, auditLog, authSessions, users } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import {
  consumeBackupCode,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  verifyTotp,
} from "./totp";

/**
 * Double vérification de l'administratrice : mise en place et contrôle des codes.
 * Toutes les opérations passent par le rôle plateforme et sont journalisées.
 */

type Options = { database?: Database; now?: () => number };

export async function getAdminSecurityState(userId: string, { database }: Options = {}) {
  return withPlatform(async (tx) => {
    const [user] = await tx
      .select({ isPlatformAdmin: users.isPlatformAdmin, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const [twoFactor] = await tx.select().from(adminTwoFactors).where(eq(adminTwoFactors.userId, userId));
    return {
      isPlatformAdmin: user?.isPlatformAdmin ?? false,
      email: user?.email ?? "",
      twoFactorConfirmed: Boolean(twoFactor?.confirmedAt),
      backupCodesLeft: twoFactor?.backupCodeHashes.length ?? 0,
    };
  }, database);
}

/**
 * Prépare (ou renouvelle, tant qu'elle n'est pas confirmée) la clé à scanner.
 * Renvoie la clé en clair pour l'afficher sous forme de QR code.
 */
export async function beginTwoFactorSetup(userId: string, { database }: Options = {}): Promise<string> {
  return withPlatform(async (tx) => {
    const [existing] = await tx.select().from(adminTwoFactors).where(eq(adminTwoFactors.userId, userId));
    if (existing?.confirmedAt) throw new Error("La double vérification est déjà configurée.");
    if (existing) return decryptSecret(existing.secretEncrypted, authSecret());
    const secret = generateTotpSecret();
    await tx.insert(adminTwoFactors).values({ userId, secretEncrypted: encryptSecret(secret, authSecret()) });
    return secret;
  }, database);
}

async function markSessionVerified(
  tx: Parameters<Parameters<typeof withPlatform>[0]>[0],
  userId: string,
  sessionId: string,
) {
  await tx
    .update(authSessions)
    .set({ twoFactorVerifiedAt: new Date() })
    .where(and(eq(authSessions.id, sessionId), eq(authSessions.userId, userId)));
}

/** Confirme la mise en place avec un premier code ; renvoie les codes de secours, ou null si le code est faux. */
export async function confirmTwoFactorSetup(
  userId: string,
  sessionId: string,
  code: string,
  { database, now = Date.now }: Options = {},
): Promise<string[] | null> {
  return withPlatform(async (tx) => {
    // Verrou de la ligne : deux saisies simultanées du même code ne passent pas toutes les deux.
    const [record] = await tx
      .select()
      .from(adminTwoFactors)
      .where(eq(adminTwoFactors.userId, userId))
      .for("update");
    if (!record || record.confirmedAt) return null;
    const step = verifyTotp(decryptSecret(record.secretEncrypted, authSecret()), code, null, now());
    if (step === null) return null;
    const backup = generateBackupCodes();
    await tx
      .update(adminTwoFactors)
      .set({ confirmedAt: new Date(), lastUsedStep: step, backupCodeHashes: backup.hashes })
      .where(eq(adminTwoFactors.userId, userId));
    await tx.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));
    await markSessionVerified(tx, userId, sessionId);
    await recordAudit(tx, { actorUserId: userId, action: "admin.two_factor_enabled" });
    return backup.codes;
  }, database);
}

/** Erreurs de code tolérées sur la période avant blocage (compté en base : commun à tous les serveurs). */
const MAX_FAILED_CODES = 10;
const FAILED_CODES_WINDOW_MS = 15 * 60 * 1000;

/**
 * Vérifie un code (ou un code de secours) pour la session en cours.
 * « locked » : trop d'erreurs récentes (depuis la dernière connexion réussie), essai refusé.
 */
export async function verifyAdminCode(
  userId: string,
  sessionId: string,
  code: string,
  { database, now = Date.now }: Options = {},
): Promise<boolean | "locked"> {
  return withPlatform(async (tx) => {
    // Verrou de la ligne : deux saisies simultanées du même code ne passent pas toutes les deux.
    const [record] = await tx
      .select()
      .from(adminTwoFactors)
      .where(eq(adminTwoFactors.userId, userId))
      .for("update");
    if (!record?.confirmedAt) return false;

    const [failures] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.actorUserId, userId),
          eq(auditLog.action, "admin.login_failed"),
          gt(auditLog.createdAt, new Date(Date.now() - FAILED_CODES_WINDOW_MS)),
          sql`${auditLog.createdAt} > coalesce((SELECT max(created_at) FROM audit_log WHERE actor_user_id = ${userId} AND action = 'admin.login'), '-infinity')`,
        ),
      );
    if ((failures?.count ?? 0) >= MAX_FAILED_CODES) return "locked";

    const step = verifyTotp(
      decryptSecret(record.secretEncrypted, authSecret()),
      code,
      record.lastUsedStep,
      now(),
    );
    if (step !== null) {
      await tx.update(adminTwoFactors).set({ lastUsedStep: step }).where(eq(adminTwoFactors.userId, userId));
      await markSessionVerified(tx, userId, sessionId);
      await recordAudit(tx, { actorUserId: userId, action: "admin.login", details: { method: "totp" } });
      return true;
    }

    const remaining = consumeBackupCode(code, record.backupCodeHashes);
    if (remaining) {
      await tx
        .update(adminTwoFactors)
        .set({ backupCodeHashes: remaining })
        .where(eq(adminTwoFactors.userId, userId));
      await markSessionVerified(tx, userId, sessionId);
      await recordAudit(tx, {
        actorUserId: userId,
        action: "admin.login",
        details: { method: "backup_code", backupCodesLeft: remaining.length },
      });
      return true;
    }

    await recordAudit(tx, { actorUserId: userId, action: "admin.login_failed" });
    return false;
  }, database);
}
