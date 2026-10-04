import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, type Database } from "./client";
import { adminTwoFactors, auditLog, authSessions, users } from "./schema";

/**
 * Donne ou retire le statut d'administratrice. Volontairement impossible depuis
 * le site : seule une personne ayant accès au serveur peut le faire.
 *
 *   pnpm admin:grant prenom@exemple.com
 *   pnpm admin:revoke prenom@exemple.com
 *
 * Le compte est créé s'il n'existe pas encore. Chaque changement est journalisé.
 */
export async function setPlatformAdmin(database: Database, rawEmail: string, isAdmin: boolean) {
  const email = z.email().parse(rawEmail.trim().toLowerCase());
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    const [user] = existing
      ? await tx.update(users).set({ isPlatformAdmin: isAdmin }).where(eq(users.id, existing.id)).returning()
      : await tx.insert(users).values({ email, isPlatformAdmin: isAdmin }).returning();
    if (!isAdmin) {
      // Retrait : double vérification supprimée et sessions fermées.
      await tx.delete(adminTwoFactors).where(eq(adminTwoFactors.userId, user.id));
      await tx.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, user.id));
      await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
    }
    await tx.insert(auditLog).values({
      actorUserId: null,
      action: isAdmin ? "admin.granted" : "admin.revoked",
      targetType: "user",
      targetId: user.id,
      details: { email, via: "cli" },
    });
    return user;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode, email] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  if ((mode !== "grant" && mode !== "revoke") || !email) {
    console.error("Utilisation : pnpm admin:grant <email>  |  pnpm admin:revoke <email>");
    process.exit(1);
  }
  const database = createDb(url);
  setPlatformAdmin(database, email, mode === "grant")
    .then((user) =>
      console.log(
        mode === "grant"
          ? `${user.email} est administratrice. À la première connexion, la double vérification sera demandée.`
          : `${user.email} n'est plus administratrice.`,
      ),
    )
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => database.$client.end());
}
