import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createDb, type Database } from "./client";
import { createLocalStorage } from "@/lib/storage/local";
import { createR2Storage } from "@/lib/storage/r2";
import type { FileStorage } from "@/lib/storage/types";
import { addMaBeautePhotos, fillMaBeaute } from "./fixtures/ma-beaute";
import { auditLog, businesses, services, tenants } from "./schema";

/**
 * Remplit le site de Ma Beauté Institut, déjà créé dans l'admin, avec le
 * contenu de ses maquettes (textes, Laïla et Natacha, prestations, horaires) :
 *
 *   pnpm import:ma-beaute <adresse-provisoire> [e-mail-de-natacha]
 *
 * Refuse un site qui a déjà des prestations ou plusieurs entreprises (pour ne
 * rien dupliquer). Tout ou rien : en cas d'erreur, rien n'est enregistré.
 * Le site reste en brouillon ; la mise en ligne se fait dans l'admin.
 *
 *   pnpm import:ma-beaute --photos <adresse-provisoire>
 *
 * ajoute ensuite les photos et le logo des maquettes (stockage réglé avant).
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

/**
 * Même stockage que le site (src/lib/storage, réservé au serveur web) : R2 s'il
 * est configuré, sinon le dossier local, refusé en production sans
 * STORAGE_DRIVER=local (les photos seraient perdues au prochain déploiement).
 */
function scriptStorage(): FileStorage {
  const env = process.env;
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return createR2Storage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicUrl: env.R2_PUBLIC_URL,
    });
  }
  if (env.NODE_ENV === "production" && env.STORAGE_DRIVER !== "local") {
    throw new Error(
      "Stockage des photos non réglé : ajoutez STORAGE_DRIVER=local (et le volume /app/storage).",
    );
  }
  return createLocalStorage(env.LOCAL_STORAGE_DIR || "storage");
}

export async function importMaBeautePhotos(database: Database, slug: string, store: FileStorage) {
  return database.transaction(async (tx) => {
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.slug, slug.trim().toLowerCase()));
    if (!tenant) throw new Error(`Aucun site avec l'adresse provisoire « ${slug} ».`);
    await addMaBeautePhotos(tx, store, tenant.id);
    await tx.insert(auditLog).values({
      actorUserId: null,
      tenantId: tenant.id,
      action: "tenant.photos_imported",
      targetType: "tenant",
      targetId: tenant.id,
      details: { fixture: "ma-beaute", via: "cli" },
    });
    return { tenant };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const photos = args[0] === "--photos";
  const [slug, natachaEmail] = photos ? args.slice(1) : args;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  if (!slug) {
    console.error(
      "Utilisation : pnpm import:ma-beaute <adresse-provisoire> [e-mail-de-natacha]  |  pnpm import:ma-beaute --photos <adresse-provisoire>",
    );
    process.exit(1);
  }
  const database = createDb(url);
  const task = photos
    ? Promise.resolve()
        .then(() => importMaBeautePhotos(database, slug, scriptStorage()))
        .then(({ tenant }) => `Photos et logo ajoutés au site « ${tenant.slug} ».`)
    : importMaBeaute(database, slug, natachaEmail).then(
        ({ tenant }) =>
          `Contenu de Ma Beauté importé dans « ${tenant.slug} ». À compléter dans l'admin : photos, logo, SIRET, puis mise en ligne.`,
      );
  task
    .then((message) => console.log(message))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => database.$client.end());
}
