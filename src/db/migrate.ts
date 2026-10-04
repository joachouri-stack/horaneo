import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

/** Applique les migrations en attente. Utilisé en local, en test et au déploiement. */
export async function runMigrations(url: string) {
  const database = createDb(url);
  try {
    await migrate(database, { migrationsFolder: "drizzle" });
  } finally {
    await database.$client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  runMigrations(url)
    .then(() => console.log("Migrations appliquées."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
