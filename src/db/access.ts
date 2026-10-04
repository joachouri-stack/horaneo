import { sql } from "drizzle-orm";
import { appDb, type Database, type Transaction } from "./client";

/**
 * Accès aux données. Toute lecture ou écriture passe par l'une de ces fonctions.
 *
 * - withTenant : les données d'UN site (tenant). PostgreSQL masque et refuse
 *   tout le reste, même si une requête oublie de filtrer sur tenant_id.
 *   L'entreprise déclarée limite encore la vue : ses clientes, ses rendez-vous,
 *   ses paiements ; une autre entreprise du même site reste invisible.
 *   - businessId absent : l'entreprise du site s'il n'en a qu'une, sinon aucune ;
 *   - businessId null : vue « site » (pages publiques), sans données privées.
 * - withPlatform : toutes les données (espace admin, tâches techniques).
 *   Avec une entreprise déclarée, seules les lignes de cette entreprise sont
 *   visibles (et business_id est rempli à l'ajout).
 */

export const TENANT_ROLE = "app_tenant";
export const PLATFORM_ROLE = "app_platform";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Transaction) => Promise<T>,
  database: Database = appDb(),
  businessId?: string | null,
): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error(`Identifiant de tenant invalide : ${tenantId}`);
  if (businessId && !UUID.test(businessId))
    throw new Error(`Identifiant d'entreprise invalide : ${businessId}`);
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${TENANT_ROLE}`));
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    if (businessId === undefined) {
      await tx.execute(
        sql`SELECT set_config('app.business_id', coalesce(app_default_business(${tenantId}::uuid)::text, ''), true)`,
      );
    } else {
      await tx.execute(sql`SELECT set_config('app.business_id', ${businessId ?? ""}, true)`);
    }
    return fn(tx);
  });
}

export async function withPlatform<T>(
  fn: (tx: Transaction) => Promise<T>,
  database: Database = appDb(),
  businessId?: string | null,
): Promise<T> {
  if (businessId && !UUID.test(businessId))
    throw new Error(`Identifiant d'entreprise invalide : ${businessId}`);
  return database.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${PLATFORM_ROLE}`));
    if (businessId) await tx.execute(sql`SELECT set_config('app.business_id', ${businessId}, true)`);
    return fn(tx);
  });
}

/**
 * Déclare l'entreprise pour la suite de la transaction (rôle plateforme : tâches
 * qui traitent une entreprise précise, comme la préparation d'un message).
 */
export async function declareBusiness(tx: Transaction, businessId: string | null) {
  if (businessId && !UUID.test(businessId))
    throw new Error(`Identifiant d'entreprise invalide : ${businessId}`);
  await tx.execute(sql`SELECT set_config('app.business_id', ${businessId ?? ""}, true)`);
}

/** Entreprise déclarée pour la transaction (null : vue « site »). */
export async function currentBusinessId(tx: Transaction): Promise<string | null> {
  const rows = await tx.execute<{ id: string | null }>(sql`SELECT app_current_business() AS id`);
  return rows[0]?.id ?? null;
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
