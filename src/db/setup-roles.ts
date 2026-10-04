import "dotenv/config";
import postgres from "postgres";

/**
 * Crée (ou met à jour) le rôle de connexion utilisé par l'application.
 *
 * Ce rôle n'hérite d'aucun droit : pour lire ou écrire, l'application doit
 * choisir explicitement app_tenant (un seul tenant) ou app_platform (admin)
 * dans chaque transaction. Voir src/db/access.ts.
 *
 * Utilise DATABASE_URL (propriétaire de la base) pour créer le rôle décrit
 * par APP_DATABASE_URL (nom d'utilisateur et mot de passe).
 */
export async function setupRuntimeRole(ownerUrl: string, appUrl: string) {
  const parsed = new URL(appUrl);
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!/^[a-z_][a-z0-9_]{2,62}$/.test(username)) {
    throw new Error(`Nom d'utilisateur invalide dans APP_DATABASE_URL : "${username}"`);
  }
  if (password.length < 8) {
    throw new Error("Le mot de passe de APP_DATABASE_URL doit faire au moins 8 caractères.");
  }
  if (username === decodeURIComponent(new URL(ownerUrl).username)) {
    throw new Error("APP_DATABASE_URL doit utiliser un autre utilisateur que DATABASE_URL.");
  }

  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = ${username}) AS exists`;
    // Le texte de la commande est construit par PostgreSQL (format %I / %L) : pas d'injection possible.
    const [{ statement }] = await sql<{ statement: string }[]>`
      SELECT format(
        ${exists ? "ALTER ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L" : "CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L"},
        ${username}::text, ${password}::text
      ) AS statement`;
    await sql.unsafe(statement);
    const [{ grant }] = await sql<{ grant: string }[]>`
      SELECT format('GRANT app_tenant, app_platform TO %I WITH INHERIT FALSE, SET TRUE', ${username}::text) AS grant`;
    await sql.unsafe(grant);
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ownerUrl = process.env.DATABASE_URL;
  const appUrl = process.env.APP_DATABASE_URL;
  if (!ownerUrl || !appUrl) {
    throw new Error("DATABASE_URL et APP_DATABASE_URL doivent être définies (voir .env.example).");
  }
  setupRuntimeRole(ownerUrl, appUrl)
    .then(() => console.log("Rôle de connexion de l'application prêt."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
