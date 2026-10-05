import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, type Database } from "./client";
import { fillMaBeaute } from "./fixtures/ma-beaute";
import { auditLog, businesses, services, tenants } from "./schema";

/**
 * Remplit le site de Ma Beauté Institut, déjà créé dans l'admin, avec le
 * contenu de ses maquettes (textes, Laïla et Natacha, prestations, horaires) :
 *
 *   pnpm import:ma-beaute <adresse-provisoire> [e-mail-de-natacha]
 *
 * Refuse un site qui a déjà des prestations ou plusieurs entreprises (pour ne
 * rien dupliquer). Tout ou rien : en cas d'erreur, rien n'est enregistré.
 * Le site reste en brouillon ; photos, logo et mise en ligne se font dans l'admin.
 */
export async function importMaBeaute(database: Database, slug: string, natachaEmail?: string) {
  const email = natachaEmail ? z.email().parse(natachaEmail.trim().toLowerCase()) : undefined;
  return database.transaction(async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.slug, slug.trim().toLowerCase()));
    if (!tenant) throw new Error(`Aucun site avec l'adresse provisoire « ${slug} ».`);
    const siteBusinesses = await tx.select().from(businesses).where(eq(businesses.tenantId, tenant.id));
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(services)
      .where(eq(services.tenantId, tenant.id));
    if (siteBusinesses.length !== 1 || count > 0) {
      throw new Error("Ce site contient déjà des prestations ou plusieurs entreprises : import annulé.");
    }
    const [primary] = await tx
      .select()
      .from(businesses)
      .where(and(eq(businesses.tenantId, tenant.id), eq(businesses.isPrimary, true)));
    const result = await fillMaBeaute(tx, tenant.id, {
      lailaBusinessId: primary.id,
      slug: tenant.slug,
      contactEmail: tenant.email,
      natachaEmail: email,
    });
    await tx.insert(auditLog).values({
      actorUserId: null,
      tenantId: tenant.id,
      action: "tenant.content_imported",
      targetType: "tenant",
      targetId: tenant.id,
      details: { fixture: "ma-beaute", via: "cli" },
    });
    return { tenant, ...result };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [slug, natachaEmail] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  if (!slug) {
    console.error("Utilisation : pnpm import:ma-beaute <adresse-provisoire> [e-mail-de-natacha]");
    process.exit(1);
  }
  const database = createDb(url);
  importMaBeaute(database, slug, natachaEmail)
    .then(({ tenant }) =>
      console.log(
        `Contenu de Ma Beauté importé dans « ${tenant.slug} ». À compléter dans l'admin : photos, logo, SIRET, puis mise en ligne.`,
      ),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => database.$client.end());
}
