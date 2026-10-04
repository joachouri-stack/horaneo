import "server-only";
import { env } from "@/config/env";
import { createLocalStorage } from "./local";
import { createR2Storage } from "./r2";
import type { FileStorage } from "./types";

export type { FileStorage } from "./types";

let instance: FileStorage | undefined;

/**
 * Stockage des fichiers (photos, logos) :
 * - Cloudflare R2 quand R2_* est configuré (production) ;
 * - sinon un dossier local `storage/` servi par /media (développement).
 */
export function storage(): FileStorage {
  if (instance) return instance;
  const config = env();
  const r2Ready = Boolean(
    config.R2_ACCOUNT_ID && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY && config.R2_BUCKET,
  );
  if (config.STORAGE_DRIVER === "r2" || (config.STORAGE_DRIVER === "auto" && r2Ready)) {
    if (!r2Ready) throw new Error("Stockage R2 demandé mais incomplet (variables R2_*).");
    instance = createR2Storage({
      accountId: config.R2_ACCOUNT_ID!,
      accessKeyId: config.R2_ACCESS_KEY_ID!,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY!,
      bucket: config.R2_BUCKET!,
      publicUrl: config.R2_PUBLIC_URL,
    });
  } else {
    if (config.NODE_ENV === "production" && config.STORAGE_DRIVER !== "local") {
      throw new Error("Stockage R2 non configuré (variables R2_*), ou choisir STORAGE_DRIVER=local.");
    }
    instance = createLocalStorage(config.LOCAL_STORAGE_DIR);
  }
  return instance;
}
