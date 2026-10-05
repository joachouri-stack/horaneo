import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { importMaBeaute } from "@/db/import-ma-beaute";
import { businesses, services, tenants } from "@/db/schema";
import { loadSiteData } from "@/modules/site/data";
import { createTenant } from "@/modules/tenants/create";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Commande d'import du contenu de Ma Beauté dans un site créé depuis l'admin. */
describe.skipIf(!hasTestDatabase)("import du contenu de Ma Beauté Institut", () => {
  let owner: TestDb;
  let app: TestDb;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  async function newSite() {
    const slug = `ma-beaute-${Date.now().toString(36)}`;
    const { tenant } = await withPlatform(
      (tx: Transaction) =>
        createTenant(tx, {
          name: "Ma Beauté Institut",
          slug,
          planCode: "serenite",
          managerEmail: `${slug}@example.com`,
        }),
      app,
    );
    return tenant;
  }

  it("remplit le site : modèle Atelier, deux entreprises, prestations, horaires", async () => {
    const tenant = await newSite();
    await importMaBeaute(owner, tenant.slug, `natacha-${tenant.slug}@example.com`);
    const site = (await withTenant(tenant.id, (tx) => loadSiteData(tx, tenant.id), app))!;
    expect(site.tenant.templateKey).toBe("atelier");
    expect(site.tenant.theme).toBe("blush");
    expect(site.businesses.map((b) => [b.name, b.slug])).toEqual([
      ["Laïla", "laila"],
      ["Natacha", "natacha"],
    ]);
    expect(site.services.length).toBe(13);
    expect(site.openingHours.length).toBeGreaterThan(0);
    const [row] = await owner.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(row).toMatchObject({ status: "draft", slug: tenant.slug });
  });

  it("refuse un second import sans rien dupliquer", async () => {
    const tenant = await newSite();
    await importMaBeaute(owner, tenant.slug);
    await expect(importMaBeaute(owner, tenant.slug)).rejects.toThrow(/déjà/);
    expect(await owner.select().from(businesses).where(eq(businesses.tenantId, tenant.id))).toHaveLength(2);
    expect(await owner.select().from(services).where(eq(services.tenantId, tenant.id))).toHaveLength(13);
  });

  it("refuse une adresse provisoire inconnue", async () => {
    await expect(importMaBeaute(owner, "site-inexistant")).rejects.toThrow(/Aucun site/);
  });
});
