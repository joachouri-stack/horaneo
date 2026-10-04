import "dotenv/config";
import postgres from "postgres";
import { runMigrations } from "../../src/db/migrate";

/**
 * Prépare la base de test : elle est entièrement vidée, puis toutes les
 * migrations sont rejouées. Sans TEST_DATABASE_URL, les tests de base sont ignorés.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn("\n⚠ TEST_DATABASE_URL absente : les tests de base de données sont ignorés.\n");
    return;
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL doit être différente de DATABASE_URL (la base de test est vidée).");
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      CREATE SCHEMA public;
    `);
  } finally {
    await sql.end();
  }
  await runMigrations(url);
}
