import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ShowcaseEntry } from "@/config/defaults";
import type { Transaction } from "@/db/client";
import { AppError } from "@/modules/errors";
import { getPlatformSetting, setPlatformSetting } from "@/modules/settings";

/**
 * « Ils nous font confiance » : témoignages de professionnels clients, saisis
 * par l'administratrice (réglage général). L'accueil n'affiche le bloc que
 * s'il contient au moins un témoignage.
 */

export const SHOWCASE_MAX = 6;

export const showcaseInput = z.object({
  name: z.string().trim().min(1).max(80),
  activity: z.string().trim().min(1).max(80),
  url: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null)
    .pipe(z.url({ protocol: /^https?$/ }).nullable()),
  quote: z.string().trim().min(10).max(300),
  author: z.string().trim().min(1).max(60),
});

export async function listShowcase(tx: Transaction): Promise<ShowcaseEntry[]> {
  return getPlatformSetting(tx, "showcase");
}

export async function addShowcaseEntry(tx: Transaction, input: z.input<typeof showcaseInput>) {
  const entry = showcaseInput.parse(input);
  const entries = await listShowcase(tx);
  if (entries.length >= SHOWCASE_MAX) throw new AppError("quota_reached");
  const created: ShowcaseEntry = { id: randomUUID(), ...entry };
  await setPlatformSetting(tx, "showcase", [...entries, created]);
  return created;
}

export async function removeShowcaseEntry(tx: Transaction, id: string) {
  const entries = await listShowcase(tx);
  await setPlatformSetting(
    tx,
    "showcase",
    entries.filter((entry) => entry.id !== id),
  );
}
