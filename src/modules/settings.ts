import { eq } from "drizzle-orm";
import { DEFAULT_PLATFORM_SETTINGS, type PlatformSettingKey } from "@/config/defaults";
import type { Transaction } from "@/db/client";
import { platformSettings } from "@/db/schema";

/** Lit un réglage général (base de données, sinon valeur de départ). */
export async function getPlatformSetting<K extends PlatformSettingKey>(
  tx: Transaction,
  key: K,
): Promise<(typeof DEFAULT_PLATFORM_SETTINGS)[K]> {
  const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, key));
  return (row?.value as (typeof DEFAULT_PLATFORM_SETTINGS)[K]) ?? DEFAULT_PLATFORM_SETTINGS[key];
}
