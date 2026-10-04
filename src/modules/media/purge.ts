import { and, eq, lte, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { assets, staffMembers } from "@/db/schema";

type Storage = { delete(key: string): Promise<void> };
type PlatformRunner = <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;

/**
 * Suppression définitive des photos remplacées dont le délai de conservation
 * (7 jours par défaut) est passé : la fiche en base, puis le fichier.
 */
export async function purgeReplacedAssets(platform: PlatformRunner, storage: Storage, now: Date) {
  const removed = await platform((tx) =>
    tx
      .delete(assets)
      .where(
        and(
          eq(assets.status, "replaced"),
          lte(assets.purgeAfter, now),
          // Jamais une photo encore utilisée par un membre de l'équipe.
          sql`not exists (select 1 from ${staffMembers} where ${staffMembers.photoAssetId} = ${assets.id})`,
        ),
      )
      .returning({ key: assets.storageKey }),
  );
  for (const { key } of removed) {
    // Un fichier qui ne s'efface pas n'est plus référencé : il sera sans effet sur les sites.
    await storage.delete(key).catch((error) => console.error("[purge] fichier non supprimé", key, error));
  }
  return removed.length;
}
