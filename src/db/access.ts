import { sql } from "drizzle-orm";
import { appDb, type Database, type Transaction } from "./client";

/**
 * Accès aux données. Toute lecture ou écriture passe par l'une de ces fonctions.
 *
 * - withTenant : les données d'UN tenant. PostgreSQL masque et refuse tout le
 *   reste, même si une requête oublie de filtrer sur tenant_id.
 * - withPlatform : toutes les données (espace admin, tâches techniques).
 *   Réservé au code de l'espace admin ; chaque action y sera journalisée.
 */

export const TENANT_ROLE = "app_tenant";
export const PLATFORM_ROLE = "app_platform";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Transaction) => Promise<T>,
  database: Database = appDb(),
): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error(`Identifiant de tenant invalide : ${tenantId}`);
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${TENANT_ROLE}`));
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export async function withPlatform<T>(
  fn: (tx: Transaction) => Promise<T>,
  database: Database = appDb(),
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${PLATFORM_ROLE}`));
    return fn(tx);
  });
}

export type ResolvedHostname = {
  tenantId: string;
  tenantStatus: "draft" | "active" | "suspended" | "cancelled" | "deleted";
  hostname: string;
  isPrimary: boolean;
  primaryHostname: string | null;
};

/**
 * Trouve le tenant auquel appartient un nom de domaine (actif).
 * Utilise le rôle app_tenant sans tenant déclaré : seule la fonction dédiée
 * de la base est accessible, aucune table.
 */
export async function resolveHostname(
  hostname: string,
  database: Database = appDb(),
): Promise<ResolvedHostname | null> {
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${TENANT_ROLE}`));
    const rows = await tx.execute<{
      tenant_id: string;
      tenant_status: ResolvedHostname["tenantStatus"];
      hostname: string;
      is_primary: boolean;
      primary_hostname: string | null;
    }>(sql`SELECT * FROM app_resolve_hostname(${hostname})`);
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      tenantStatus: row.tenant_status,
      hostname: row.hostname,
      isPrimary: row.is_primary,
      primaryHostname: row.primary_hostname,
    };
  });
}
