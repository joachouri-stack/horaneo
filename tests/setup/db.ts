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
