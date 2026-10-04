import { eq } from "drizzle-orm";
import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettingKey } from "@/config/defaults";
import type { Transaction } from "@/db/client";
import { platformSettings } from "@/db/schema";

/** Valeur d'un réglage : le type de sa valeur de départ, élargi (ex. 0 → number). */
export type PlatformSettingValue<K extends PlatformSettingKey> =
  (typeof DEFAULT_PLATFORM_SETTINGS)[K] extends number
    ? number
    : (typeof DEFAULT_PLATFORM_SETTINGS)[K] extends string
      ? string
      : (typeof DEFAULT_PLATFORM_SETTINGS)[K];

/** Lit un réglage général (base de données, sinon valeur de départ). */
export async function getPlatformSetting<K extends PlatformSettingKey>(
  tx: Transaction,
  key: K,
): Promise<PlatformSettingValue<K>> {
  const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, key));
  return ((row?.value as PlatformSettingValue<K> | undefined) ??
    DEFAULT_PLATFORM_SETTINGS[key]) as PlatformSettingValue<K>;
}

/** Enregistre un réglage général (rôle plateforme). */
export async function setPlatformSetting<K extends PlatformSettingKey>(
  tx: Transaction,
  key: K,
  value: PlatformSettingValue<K>,
) {
  await tx
    .insert(platformSettings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: value as object } });
}
