import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "@/config/env";
import * as schema from "./schema";

/**
 * Connexion à PostgreSQL. Une seule connexion partagée par processus
 * (conservée entre les rechargements à chaud en développement).
 */

type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle({ client, schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { horaneoDb?: Db };

export function db(): Db {
  globalForDb.horaneoDb ??= createDb(databaseUrl());
  return globalForDb.horaneoDb;
}

export { schema };
