import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { createLocalStorage } from "@/lib/storage/local";
import type { FileStorage } from "@/lib/storage/types";
import { saveCategory, saveService } from "@/modules/catalog/services";
import { updatePage } from "@/modules/content/pages";
import { saveTestimonial } from "@/modules/content/testimonials";
import { retireAsset, uploadAsset } from "@/modules/media/assets";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { loadSiteData, visibleSections } from "@/modules/site/data";
import { sitemapPaths } from "@/modules/site/seo";
import { categoryPath, SITE_PATHS } from "@/modules/site/paths";
import { createTenant } from "@/modules/tenants/create";
import { changePlan } from "@/modules/tenants/update";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Ce qu'affiche le site d'un client, lu avec le rôle du tenant (comme en vrai). */
describe.skipIf(!hasTestDatabase)("site d'un client : données affichées", () => {
  let owner: TestDb;
  let app: TestDb;
  let store: FileStorage;
  let dir: string;
  let n = 0;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    dir = await mkdtemp(path.join(tmpdir(), "horaneo-site-"));
    store = createLocalStorage(dir);
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
    await rm(dir, { recursive: true, force: true });
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  const load = (tenantId: string) => withTenant(tenantId, (tx) => loadSiteData(tx, tenantId), app);
  const png = async () =>
    new Uint8Array(
      await sharp({ create: { width: 300, height: 200, channels: 3, background: "#88aa99" } })
        .png()
        .toBuffer(),
    );

  async function newTenant(planCode: string) {
    n += 1;
    const slug = `site-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: `Institut ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    return tenant;
  }

  it("site complet : catégories, prestations actives, pages avec contenu", async () => {
    const tenant = await newTenant("serenite");
    const category = await platform((tx) => saveCategory(tx, tenant.id, { name: "Soins du visage" }));
    await platform((tx) =>
      saveService(tx, tenant.id, {
        name: "Soin éclat",
        categoryId: category.id,
        durationMinutes: 45,
        price: "59",
      }),
    );
    await platform((tx) =>
      saveService(tx, tenant.id, { name: "Ancien soin", durationMinutes: 30, price: "20", isActive: false }),
    );
    await platform((tx) =>
      saveService(tx, tenant.id, { name: "Sans catégorie", durationMinutes: 30, price: "25" }),
    );
    await platform((tx) => updatePage(tx, tenant.id, { pageKey: "home", texts: { tagline: "Bienvenue" } }));
    await platform((tx) =>
      replaceOpeningHours(tx, tenant.id, [{ weekday: 2, opensAt: "10:00", closesAt: "19:00" }]),
    );

    const site = (await load(tenant.id))!;
    expect(site.features.fullSite).toBe(true);
    expect(site.categories).toHaveLength(1);
    expect(site.categories[0]).toMatchObject({ name: "Soins du visage", slug: "soins-du-visage" });
    expect(site.categories[0].services.map((s) => s.name)).toEqual(["Soin éclat"]);
    expect(site.uncategorized.map((s) => s.name)).toEqual(["Sans catégorie"]);
    expect(site.services.map((s) => s.name)).not.toContain("Ancien soin");
    expect(site.pages.home?.texts.tagline).toBe("Bienvenue");
    expect(site.openingHours).toMatchObject([{ weekday: 2, opensAt: "10:00", closesAt: "19:00" }]);

    // Pas encore de galerie, d'équipe ni d'avis : ces pages sont masquées.
    expect(visibleSections(site)).toEqual({
      services: true,
      about: false,
      gallery: false,
      testimonials: false,
      practical: true,
    });
    expect(sitemapPaths(site, visibleSections(site), SITE_PATHS, categoryPath)).toEqual([
      "/",
      "/prestations",
      "/prestations/soins-du-visage",
      "/infos-pratiques",
      "/mentions-legales",
      "/confidentialite",
      "/conditions-annulation",
    ]);
  });

  it("galerie : photos actives seulement ; page masquable par l'administratrice", async () => {
    const tenant = await newTenant("serenite");
    const kept = await platform(async (tx) =>
      uploadAsset(tx, store, tenant.id, {
        bytes: await png(),
        kind: "gallery",
        uploadedByUserId: null,
        alt: "Salle",
      }),
    );
    const removed = await platform(async (tx) =>
      uploadAsset(tx, store, tenant.id, { bytes: await png(), kind: "gallery", uploadedByUserId: null }),
    );
    await platform((tx) => retireAsset(tx, tenant.id, removed.id));
    let site = (await load(tenant.id))!;
    expect(site.gallery.map((photo) => photo.key)).toEqual([kept.storageKey]);
    expect(site.gallery[0].alt).toBe("Salle");
    expect(visibleSections(site).gallery).toBe(true);

    await platform((tx) => updatePage(tx, tenant.id, { pageKey: "gallery", texts: {}, isPublished: false }));
    site = (await load(tenant.id))!;
    expect(visibleSections(site).gallery).toBe(false);
  });

  it("fiche Basic : une seule page, pas d'avis, signature du SaaS", async () => {
    const tenant = await newTenant("essentiel");
    await platform((tx) => saveTestimonial(tx, tenant.id, { authorName: "Camille", text: "Super" }));
    expect((await load(tenant.id))!.testimonials).toHaveLength(1);

    await platform((tx) => changePlan(tx, tenant.id, "basic"));
    const site = (await load(tenant.id))!;
    expect(site.features).toEqual({ fullSite: false, testimonials: false, brandingFooter: true });
    expect(site.testimonials).toEqual([]);
    expect(Object.values(visibleSections(site)).every((visible) => !visible)).toBe(true);
    expect(sitemapPaths(site, visibleSections(site), SITE_PATHS, categoryPath)).toEqual([
      "/",
      "/mentions-legales",
      "/confidentialite",
      "/conditions-annulation",
    ]);
  });

  it("un site ne peut lire que ses propres données", async () => {
    const mine = await newTenant("serenite");
    const other = await newTenant("serenite");
    await platform((tx) => saveService(tx, other.id, { name: "Secret", durationMinutes: 30, price: "10" }));
    // Avec le rôle du tenant « mine », les données de « other » sont invisibles.
    expect(await withTenant(mine.id, (tx) => loadSiteData(tx, other.id), app)).toBeNull();
    expect((await load(other.id))!.services.map((s) => s.name)).toEqual(["Secret"]);
  });

  it("adresse principale du site", async () => {
    const tenant = await newTenant("basic");
    expect((await load(tenant.id))!.primaryHostname).toBe(`${tenant.slug}.horaneo.com`);
  });
});
