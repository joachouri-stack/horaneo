import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appDatabaseUrl } from "@/config/env";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => {} });
  return drizzle({ client, schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { horaneoAppDb?: Database };

/**
 * Connexion de l'application, avec le rôle restreint (APP_DATABASE_URL).
 * Ne pas l'utiliser directement : passer par withTenant / withPlatform
 * (src/db/access.ts). Sans eux, toute requête est refusée par la base.
 */
export function appDb(): Database {
  globalForDb.horaneoAppDb ??= createDb(appDatabaseUrl());
  return globalForDb.horaneoAppDb;
}

export { schema };
