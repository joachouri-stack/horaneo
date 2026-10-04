import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { createDb } from "./client";
import { platformSettings, plans } from "./schema";
import { DEFAULT_PLANS, DEFAULT_PLATFORM_SETTINGS } from "@/config/defaults";

/**
 * Insère les valeurs de départ (packs et réglages) si elles n'existent pas.
 * Peut être relancé sans risque : les valeurs déjà modifiées dans l'admin
 * ne sont jamais écrasées (seules les valeurs absentes sont ajoutées).
 */
export async function seed(url: string) {
  const database = createDb(url);
  try {
    await database
      .insert(platformSettings)
      .values(
        Object.entries(DEFAULT_PLATFORM_SETTINGS)
          // Un réglage sans valeur de départ (rempli plus tard, ex. taux de TVA Stripe) n'est pas copié.
          .filter(([, value]) => value !== null)
          .map(([key, value]) => ({ key, value: value as object })),
      )
      .onConflictDoNothing();
    await database
      .insert(plans)
      .values(DEFAULT_PLANS.map((plan) => ({ ...plan, currency: "EUR" })))
      .onConflictDoNothing();
    // Packs déjà en base : on complète seulement ce qui manque (accroche, nouvelles fonctions).
    for (const plan of DEFAULT_PLANS) {
      await database
        .update(plans)
        .set({
          description: sql`coalesce(${plans.description}, ${JSON.stringify(plan.description)}::jsonb)`,
          features: sql`${JSON.stringify(plan.features)}::jsonb || ${plans.features}`,
        })
        .where(eq(plans.code, plan.code));
    }
  } finally {
    await database.$client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  seed(url)
    .then(() => console.log("Valeurs de départ insérées."))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
