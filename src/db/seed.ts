import "dotenv/config";
import { createDb } from "./client";
import { platformSettings, plans } from "./schema";
import { DEFAULT_PLANS, DEFAULT_PLATFORM_SETTINGS } from "@/config/defaults";

/**
 * Insère les valeurs de départ (packs et réglages) si elles n'existent pas.
 * Peut être relancé sans risque : les valeurs déjà modifiées dans l'admin
 * ne sont jamais écrasées.
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
