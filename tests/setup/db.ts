import { sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { seed } from "@/db/seed";

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;
export const hasTestDatabase = Boolean(testDatabaseUrl);

export type TestDb = ReturnType<typeof createDb>;

/** Connexion avec le rôle restreint de l'application (soumis aux règles d'accès par ligne). */
export function openAppDb(): TestDb {
  const url = process.env.TEST_APP_DATABASE_URL;
  if (!url) throw new Error("TEST_APP_DATABASE_URL absente");
  return createDb(url);
}

/** Connexion propriétaire (sans restriction), pour préparer les données des tests. */
export async function openTestDb(): Promise<TestDb> {
  if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL absente");
  await seed(testDatabaseUrl);
  return createDb(testDatabaseUrl);
}

/** Code d'erreur PostgreSQL d'une requête refusée (23P01 = chevauchement, 23503 = lien invalide…). */
export async function pgErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const err = error as { code?: string; cause?: { code?: string } };
    return err.code ?? err.cause?.code;
  }
}

/**
 * Remet en vente les anciens packs (Basic, Essentiel, Sérénité, Express,
 * Vitrine, Signature) et la formule sans engagement, le temps d'un fichier de
 * tests qui s'en sert pour vérifier les mécanismes d'abonnement. Renvoie la
 * fonction qui rétablit la grille actuelle.
 */
export async function withLegacyCatalog(owner: TestDb) {
  const codes = ["basic", "essentiel", "serenite", "express", "vitrine", "signature"];
  await owner.execute(
    sql`UPDATE plans SET is_public = true WHERE code IN ${sql.raw(`('${codes.join("','")}')`)}`,
  );
  await owner.execute(
    sql`UPDATE platform_settings SET value = 'true'::jsonb WHERE key = 'offer_no_commitment'`,
  );
  return async () => {
    await owner.execute(
      sql`UPDATE plans SET is_public = false WHERE code IN ${sql.raw(`('${codes.join("','")}')`)}`,
    );
    await owner.execute(
      sql`UPDATE platform_settings SET value = 'false'::jsonb WHERE key = 'offer_no_commitment'`,
    );
  };
}
