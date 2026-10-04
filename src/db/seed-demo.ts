import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { plans, tenantDomains, tenantSettings, tenants } from "./schema";

/**
 * Crée un institut de démonstration pour le développement local,
 * visible sur http://institut-demo.localhost:3000.
 * Refuse de s'exécuter en production.
 */
async function seedDemo(url: string) {
  if (process.env.NODE_ENV === "production") throw new Error("Démo interdite en production.");
  const database = createDb(url);
  const mainDomain = process.env.MAIN_DOMAIN ?? "horaneo.com";
  try {
    const existing = await database.select().from(tenants).where(eq(tenants.slug, "institut-demo"));
    if (existing.length > 0) return;
    const [plan] = await database.select().from(plans).where(eq(plans.code, "basic"));
    const [tenant] = await database
      .insert(tenants)
      .values({
        slug: "institut-demo",
        name: "Institut Démo",
        planId: plan.id,
        status: "active",
        city: "Lyon",
        phone: "+33478000000",
        activatedAt: new Date(),
      })
      .returning();
    await database.insert(tenantSettings).values({ tenantId: tenant.id });
    await database.insert(tenantDomains).values({
      tenantId: tenant.id,
      hostname: `institut-demo.${mainDomain}`,
      type: "subdomain",
      isPrimary: true,
      status: "active",
    });
  } finally {
    await database.$client.end();
  }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
seedDemo(url)
  .then(() => console.log("Institut de démonstration prêt : http://institut-demo.localhost:3000"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
