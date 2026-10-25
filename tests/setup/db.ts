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
 * Remet en vente les anciens packs (Essentiel, Sérénité, Express,
 * Vitrine, Signature) et la formule sans engagement, le temps d'un fichier de
 * tests qui s'en sert pour vérifier les mécanismes d'abonnement. Renvoie la
 * fonction qui rétablit la grille actuelle.
 */
export async function withLegacyCatalog(owner: TestDb, { freeOnSale = false } = {}) {
  const codes = sql.raw(`('essentiel', 'serenite', 'express', 'vitrine', 'signature')`);
  await owner.execute(sql`UPDATE plans SET is_public = true WHERE code IN ${codes}`);
  // Ancienne offre avec un pack gratuit à la vente (demande validée à la main).
  if (freeOnSale) await owner.execute(sql`UPDATE plans SET is_public = true WHERE code = 'basic'`);
  await owner.execute(
    sql`UPDATE platform_settings SET value = 'true'::jsonb WHERE key = 'offer_no_commitment'`,
  );
  // Les anciens packs étaient affichés et facturés toutes taxes comprises ;
  // le taux de TVA Stripe est recréé par le faux Stripe de chaque fichier.
  await owner.execute(sql`UPDATE platform_settings SET value = '"TTC"'::jsonb WHERE key = 'prices_display'`);
  await owner.execute(sql`DELETE FROM platform_settings WHERE key = 'stripe_tax_rate'`);
  return async () => {
    await owner.execute(sql`UPDATE plans SET is_public = false WHERE code IN ${codes} OR code = 'basic'`);
    await owner.execute(sql`UPDATE platform_settings SET value = '"HT"'::jsonb WHERE key = 'prices_display'`);
    await owner.execute(sql`DELETE FROM platform_settings WHERE key = 'stripe_tax_rate'`);
  };
}

/**
 * Règles de l'ancien Basic (5 réservations par mois, 5 photos, 10 prestations,
 * sans nom de domaine), le temps d'un fichier de tests qui vérifie ces
 * mécanismes de quota. Renvoie la fonction qui rétablit le Basic actuel.
 */
export async function withLegacyBasic(owner: TestDb) {
  const [before] = await owner.execute<{ limits: unknown; features: unknown }>(
    sql`SELECT limits, features FROM plans WHERE code = 'basic'`,
  );
  await owner.execute(sql`UPDATE plans SET
    limits = limits || '{"onlineBookingsPerMonth": 5, "members": 1, "photos": 5, "services": 10, "customers": null}'::jsonb,
    features = features || '{"customDomain": false}'::jsonb
    WHERE code = 'basic'`);
  return async () => {
    await owner.execute(sql`UPDATE plans SET
      limits = ${JSON.stringify(before.limits)}::jsonb,
      features = ${JSON.stringify(before.features)}::jsonb
      WHERE code = 'basic'`);
  };
}
