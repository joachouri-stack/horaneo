import "dotenv/config";
import { z } from "zod";
import { backupFiles, s3Bucket } from "@/lib/backup/files";

/**
 * Copie les fichiers du serveur (logos, photos) vers le compartiment de
 * sauvegarde. À lancer chaque nuit (tâche planifiée Coolify) :
 *
 *   pnpm files:backup
 */

const config = z
  .object({
    BACKUP_S3_ENDPOINT: z.url(),
    BACKUP_S3_BUCKET: z.string().min(1),
    BACKUP_S3_ACCESS_KEY_ID: z.string().min(1),
    BACKUP_S3_SECRET_ACCESS_KEY: z.string().min(1),
    LOCAL_STORAGE_DIR: z.string().default("storage"),
  })
  .parse(process.env);

backupFiles({
  root: config.LOCAL_STORAGE_DIR,
  prefix: "fichiers",
  bucket: s3Bucket({
    endpoint: config.BACKUP_S3_ENDPOINT,
    bucket: config.BACKUP_S3_BUCKET,
    accessKeyId: config.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: config.BACKUP_S3_SECRET_ACCESS_KEY,
  }),
})
  .then((result) =>
    console.log(`Sauvegarde des fichiers : ${result.uploaded} envoyé(s) sur ${result.total}.`),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
