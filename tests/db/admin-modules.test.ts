import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  memberships,
  sitePages,
  staffSchedules,
  tenantDomains,
  businessSettings,
  tenants,
  users,
} from "@/db/schema";
import { createLocalStorage } from "@/lib/storage/local";
import type { FileStorage } from "@/lib/storage/types";
import {
  deleteCategory,
  saveCategory,
  addCategoryLogo,
  saveService,
  listServices,
  deleteService,
} from "@/modules/catalog/services";
import { updatePage } from "@/modules/content/pages";
import { saveTestimonial } from "@/modules/content/testimonials";
import { updatePlatformSettings } from "@/modules/billing/admin";
import { AppError } from "@/modules/errors";
import { getPlatformSetting } from "@/modules/settings";
import {
  listActiveAssets,
  listRetiredAssets,
  restoreAsset,
  retireAsset,
  uploadAsset,
  uploadLogo,
} from "@/modules/media/assets";
import { countUsage } from "@/modules/quotas";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { listStaff, saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import {
  addCustomDomain,
  markDomainActive,
  removeCustomDomain,
  setPrimaryDomain,
} from "@/modules/tenants/domains";
import { getDashboardStats, getTenantOverview, listTenants } from "@/modules/tenants/queries";
import {
  changePlan,
  changeStatus,
  updateAppearance,
  updateContactBar,
  updateIdentity,
} from "@/modules/tenants/update";
import { hasTestDatabase, openAppDb, openTestDb, withLegacyBasic, type TestDb } from "../setup/db";

/** Modules de l'espace admin, sur vraie base, avec le rôle restreint de l'application. */
describe.skipIf(!hasTestDatabase)("espace admin : modules", () => {
  let owner: TestDb;
  let restoreBasic: (() => Promise<void>) | undefined;
  let app: TestDb;
  let store: FileStorage;
  let storageDir: string;
  let n = 0;

  beforeAll(async () => {
    owner = await openTestDb();
    // Ces tests vérifient les quotas avec les règles de l'ancien Basic.
    restoreBasic = await withLegacyBasic(owner);
    app = openAppDb();
    storageDir = await mkdtemp(path.join(tmpdir(), "horaneo-test-"));
    store = createLocalStorage(storageDir);
  });

  afterAll(async () => {
    await restoreBasic?.();
    await app?.$client.end();
    await owner?.$client.end();
    await rm(storageDir, { recursive: true, force: true });
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function newTenant(planCode = "essentiel", overrides: Record<string, unknown> = {}) {
    n += 1;
    const slug = `client-${n}-${Date.now().toString(36)}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: `Institut ${n}`,
        slug,
        planCode,
        managerEmail: `gerante-${slug}@example.com`,
        phone: "06 12 34 56 78",
        ...overrides,
      }),
    );
    return tenant;
  }

  const png = async (color: string, size = 400) =>
    new Uint8Array(
      await sharp({ create: { width: size, height: size, channels: 3, background: color } })
        .png()
        .toBuffer(),
    );

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  describe("création d'un client", () => {
    it("crée le tenant en création, avec réglages, adresse, pages et compte de la gérante", async () => {
      const tenant = await newTenant();
      expect(tenant.status).toBe("draft");
      expect(tenant.phone).toBe("+33612345678");
      const [domain] = await owner.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenant.id));
      expect(domain).toMatchObject({
        hostname: `${tenant.slug}.horaneo.com`,
        isPrimary: true,
        status: "active",
      });
      expect(
        await owner.select().from(businessSettings).where(eq(businessSettings.tenantId, tenant.id)),
      ).toHaveLength(1);
      expect(await owner.select().from(sitePages).where(eq(sitePages.tenantId, tenant.id))).toHaveLength(7);
      const [membership] = await owner.select().from(memberships).where(eq(memberships.tenantId, tenant.id));
      const [manager] = await owner.select().from(users).where(eq(users.id, membership.userId));
      expect(manager.email).toBe(`gerante-${tenant.slug}@example.com`);
      expect(manager.isPlatformAdmin).toBe(false);
    });

    it("rattache une gérante existante sans créer de doublon", async () => {
      const first = await newTenant();
      const [membership] = await owner.select().from(memberships).where(eq(memberships.tenantId, first.id));
      const [manager] = await owner.select().from(users).where(eq(users.id, membership.userId));
      const second = await newTenant("basic", { managerEmail: manager.email.toUpperCase() });
      const [link] = await owner.select().from(memberships).where(eq(memberships.tenantId, second.id));
      expect(link.userId).toBe(manager.id);
    });

    it("refuse une adresse déjà prise, réservée ou mal formée", async () => {
      const tenant = await newTenant();
      const base = { name: "Institut X", planCode: "basic", managerEmail: "x@example.com" };
      expect(await errorCode(platform((tx) => createTenant(tx, { ...base, slug: tenant.slug })))).toBe(
        "slug_taken",
      );
      expect(await errorCode(platform((tx) => createTenant(tx, { ...base, slug: "admin" })))).toBe(
        "slug_reserved",
      );
      expect(await errorCode(platform((tx) => createTenant(tx, { ...base, slug: "Institut Léa" })))).toBe(
        "slug_invalid",
      );
    });

    it("refuse un numéro de téléphone invalide", async () => {
      expect(await errorCode(newTenant("basic", { phone: "12" }))).toBe("phone_invalid");
    });
  });

  describe("coordonnées, apparence, statut, pack", () => {
    it("change l'adresse nom.horaneo.com avec le slug", async () => {
      const tenant = await newTenant();
      const slug = `${tenant.slug}-bis`;
      await platform((tx) =>
        updateIdentity(tx, tenant.id, {
          name: "Nouveau nom",
          slug,
          country: "FR",
          timezone: "Europe/Paris",
          phone: "0478000000",
        }),
      );
      const [domain] = await owner.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenant.id));
      expect(domain.hostname).toBe(`${slug}.horaneo.com`);
    });

    it("enregistrer les coordonnées sans les champs GPS ne les efface pas ; avec, les modifie", async () => {
      const tenant = await newTenant();
      const base = { name: "Salon GPS", slug: tenant.slug, country: "FR", timezone: "Europe/Paris" };
      await platform((tx) =>
        updateIdentity(tx, tenant.id, { ...base, latitude: "45,764", longitude: "4.8357" }),
      );
      await platform((tx) => updateIdentity(tx, tenant.id, { ...base, phone: "0478000000" }));
      const [kept] = await owner.select().from(tenants).where(eq(tenants.id, tenant.id));
      expect([kept.latitude, kept.longitude].map(Number)).toEqual([45.764, 4.8357]);
      await platform((tx) => updateIdentity(tx, tenant.id, { ...base, latitude: "", longitude: "" }));
      const [cleared] = await owner.select().from(tenants).where(eq(tenants.id, tenant.id));
      expect([cleared.latitude, cleared.longitude]).toEqual([null, null]);
    });

    it("réglages : un champ absent garde sa valeur, une case vide est refusée", async () => {
      const before = await platform((tx) => getPlatformSetting(tx, "vat_rate_percent"));
      const demo = String(await platform((tx) => getPlatformSetting(tx, "demo_url")));
      await platform((tx) => updatePlatformSettings(tx, { demo_url: demo }));
      expect(await platform((tx) => getPlatformSetting(tx, "vat_rate_percent"))).toBe(before);
      await expect(platform((tx) => updatePlatformSettings(tx, { vat_rate_percent: "" }))).rejects.toThrow();
      await expect(
        platform((tx) => updatePlatformSettings(tx, { demo_url: "javascript:alert(1)" })),
      ).rejects.toThrow();
      expect(await platform((tx) => getPlatformSetting(tx, "vat_rate_percent"))).toBe(before);
    });

    it("réglages : numéro WhatsApp mis au format international, numéro invalide refusé", async () => {
      await platform((tx) => updatePlatformSettings(tx, { whatsapp_number: "06 12 34 56 78" }));
      expect(await platform((tx) => getPlatformSetting(tx, "whatsapp_number"))).toBe("+33612345678");
      await expect(platform((tx) => updatePlatformSettings(tx, { whatsapp_number: "12" }))).rejects.toThrow();
      await platform((tx) => updatePlatformSettings(tx, { whatsapp_number: "" }));
      expect(await platform((tx) => getPlatformSetting(tx, "whatsapp_number"))).toBe("");
    });

    it("enregistre modèle, ambiance et couleurs", async () => {
      const tenant = await newTenant();
      const updated = await platform((tx) =>
        updateAppearance(tx, tenant.id, {
          templateKey: "wellness",
          theme: "nature",
          primary: "#AA3355",
          secondary: "#f0e0d0",
        }),
      );
      expect(updated.theme).toBe("nature");
      expect(updated.brand.colors).toMatchObject({ primary: "#aa3355", secondary: "#f0e0d0" });
    });

    it("bouton du bas : SMS vers un autre numéro, refuse un numéro invalide", async () => {
      const tenant = await newTenant();
      await platform((tx) => updateContactBar(tx, tenant.id, { mode: "sms", phone: "06 12 01 73 85" }));
      const [row] = await owner.select().from(tenants).where(eq(tenants.id, tenant.id));
      expect(row.brand.contactBar).toEqual({ mode: "sms", phone: "+33612017385" });
      // Numéro vide : celui du site.
      await platform((tx) => updateContactBar(tx, tenant.id, { mode: "call", phone: "" }));
      const [again] = await owner.select().from(tenants).where(eq(tenants.id, tenant.id));
      expect(again.brand.contactBar).toEqual({ mode: "call", phone: null });
      expect(
        await errorCode(platform((tx) => updateContactBar(tx, tenant.id, { mode: "sms", phone: "12" }))),
      ).toBe("phone_invalid");
    });

    it("met en ligne, suspend, réactive ; refuse une transition impossible", async () => {
      const tenant = await newTenant();
      expect(await platform((tx) => changeStatus(tx, tenant.id, "activate"))).toEqual({
        before: "draft",
        after: "active",
      });
      expect(await errorCode(platform((tx) => changeStatus(tx, tenant.id, "activate")))).toBe("invalid");
      expect((await platform((tx) => changeStatus(tx, tenant.id, "suspend"))).after).toBe("suspended");
      expect((await platform((tx) => changeStatus(tx, tenant.id, "reactivate"))).after).toBe("active");
    });

    it("domaine propre : pack requis, en attente, activation, adresse principale, retour au Basic", async () => {
      const basic = await newTenant("basic");
      expect(await errorCode(platform((tx) => addCustomDomain(tx, basic.id, "institut.example.fr")))).toBe(
        "feature_unavailable",
      );

      const tenant = await newTenant("essentiel");
      const hostname = `www.institut-${tenant.slug}.example.fr`;
      const domain = await platform((tx) =>
        addCustomDomain(tx, tenant.id, `https://${hostname.toUpperCase()}/`),
      );
      expect(domain).toMatchObject({ hostname, status: "pending", isPrimary: false });
      expect(await errorCode(platform((tx) => setPrimaryDomain(tx, tenant.id, domain.id)))).toBe(
        "domain_not_active",
      );
      expect(await errorCode(platform((tx) => addCustomDomain(tx, tenant.id, hostname)))).toBe(
        "hostname_taken",
      );
      expect(await errorCode(platform((tx) => addCustomDomain(tx, tenant.id, "pirate.horaneo.com")))).toBe(
        "hostname_invalid",
      );

      await platform((tx) => markDomainActive(tx, tenant.id, domain.id));
      await platform((tx) => setPrimaryDomain(tx, tenant.id, domain.id));
      let domains = await owner.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenant.id));
      expect(domains.find((d) => d.isPrimary)?.hostname).toBe(hostname);

      // Passage au Basic : le site revient sur nom.horaneo.com.
      await platform((tx) => changePlan(tx, tenant.id, "basic"));
      domains = await owner.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenant.id));
      expect(domains.find((d) => d.isPrimary)?.type).toBe("subdomain");

      await platform((tx) => changePlan(tx, tenant.id, "essentiel"));
      await platform((tx) => setPrimaryDomain(tx, tenant.id, domain.id));
      await platform((tx) => removeCustomDomain(tx, tenant.id, domain.id));
      domains = await owner.select().from(tenantDomains).where(eq(tenantDomains.tenantId, tenant.id));
      expect(domains).toHaveLength(1);
      expect(domains[0].isPrimary).toBe(true);
    });
  });

  describe("prestations, équipe, horaires, contenus", () => {
    it("crée catégories et prestations, prix en euros convertis en centimes", async () => {
      const tenant = await newTenant();
      const category = await platform((tx) => saveCategory(tx, tenant.id, { name: "Soins du visage" }));
      expect(category.slug).toEqual({ fr: "soins-du-visage" });
      const service = await platform((tx) =>
        saveService(tx, tenant.id, {
          name: "Soin éclat",
          categoryId: category.id,
          durationMinutes: 60,
          price: "45,50",
        }),
      );
      expect(service).toMatchObject({ priceCents: 4550, currency: "EUR", name: { fr: "Soin éclat" } });
      expect(await errorCode(platform((tx) => deleteCategory(tx, tenant.id, category.id)))).toBe(
        "category_not_empty",
      );
      expect(await platform((tx) => deleteService(tx, tenant.id, service.id))).toEqual({ deleted: true });
      await platform((tx) => deleteCategory(tx, tenant.id, category.id));
    });

    it("respecte la limite de 10 prestations du pack Basic", async () => {
      const tenant = await newTenant("basic");
      for (let i = 0; i < 10; i++) {
        await platform((tx) =>
          saveService(tx, tenant.id, { name: `P${i}`, durationMinutes: 30, price: "10" }),
        );
      }
      expect(
        await errorCode(
          platform((tx) => saveService(tx, tenant.id, { name: "P11", durationMinutes: 30, price: "10" })),
        ),
      ).toBe("quota_reached");
    });

    it("horaires : plusieurs plages par jour, refus des chevauchements", async () => {
      const tenant = await newTenant();
      await platform((tx) =>
        replaceOpeningHours(tx, tenant.id, [
          { weekday: 1, opensAt: "09:00", closesAt: "12:00" },
          { weekday: 1, opensAt: "14:00", closesAt: "19:00" },
        ]),
      );
      expect(
        await errorCode(
          platform((tx) =>
            replaceOpeningHours(tx, tenant.id, [
              { weekday: 2, opensAt: "09:00", closesAt: "13:00" },
              { weekday: 2, opensAt: "12:00", closesAt: "18:00" },
            ]),
          ),
        ),
      ).toBe("hours_overlap");
      expect(
        await errorCode(
          platform((tx) =>
            replaceOpeningHours(tx, tenant.id, [{ weekday: 3, opensAt: "18:00", closesAt: "09:00" }]),
          ),
        ),
      ).toBe("hours_invalid");
    });

    it("membre de l'équipe : prestations, horaires par défaut, limite du pack", async () => {
      const tenant = await newTenant("basic");
      await platform((tx) =>
        replaceOpeningHours(tx, tenant.id, [{ weekday: 2, opensAt: "10:00", closesAt: "18:00" }]),
      );
      const service = await platform((tx) =>
        saveService(tx, tenant.id, { name: "Coupe", durationMinutes: 30, price: "25" }),
      );
      const member = await platform((tx) =>
        saveStaff(tx, tenant.id, { name: "Léa", serviceIds: [service.id] }),
      );
      const [listed] = await platform((tx) => listStaff(tx, tenant.id));
      expect(listed.serviceIds).toEqual([service.id]);
      const schedules = await owner
        .select()
        .from(staffSchedules)
        .where(eq(staffSchedules.staffId, member.id));
      expect(schedules).toMatchObject([{ weekday: 2, startsAt: "10:00:00", endsAt: "18:00:00" }]);
      // Basic : 1 membre maximum.
      expect(await errorCode(platform((tx) => saveStaff(tx, tenant.id, { name: "Inès" })))).toBe(
        "quota_reached",
      );
    });

    it("textes des pages : rangés dans la langue du tenant, sans effacer les autres", async () => {
      const tenant = await newTenant();
      await owner.execute(
        `UPDATE site_pages SET content = '{"intro": {"en": "Welcome"}}' WHERE tenant_id = '${tenant.id}' AND page_key = 'home'` as never,
      );
      const page = await platform((tx) =>
        updatePage(tx, tenant.id, {
          pageKey: "home",
          texts: { intro: "Bienvenue", tagline: "Votre bien-être", inconnu: "x" },
        }),
      );
      expect(page.content).toEqual({
        intro: { en: "Welcome", fr: "Bienvenue" },
        tagline: { fr: "Votre bien-être" },
      });
    });

    it("témoignages réservés aux packs qui les incluent", async () => {
      const basic = await newTenant("basic");
      expect(
        await errorCode(platform((tx) => saveTestimonial(tx, basic.id, { authorName: "A", text: "Super" }))),
      ).toBe("feature_unavailable");
      const paid = await newTenant("essentiel");
      const created = await platform((tx) =>
        saveTestimonial(tx, paid.id, { authorName: "Camille", text: "Super", rating: 5 }),
      );
      expect(created.text).toEqual({ fr: "Super" });
    });
  });

  describe("photos", () => {
    it("ajoute une photo convertie, stockée, et comptée dans le quota", async () => {
      const tenant = await newTenant();
      const bytes = await png("#336699");
      const asset = await platform((tx) =>
        uploadAsset(tx, store, tenant.id, { bytes, kind: "gallery", uploadedByUserId: null }),
      );
      expect(asset.storageKey).toMatch(new RegExp(`^tenants/${tenant.id}/gallery/.+\\.webp$`));
      expect(await store.get(asset.storageKey)).not.toBeNull();
      expect(await platform((tx) => countUsage(tx, tenant.id, "photos"))).toBe(1);
    });

    it("page formation : logos choisis parmi les photos du site uniquement", async () => {
      const tenant = await newTenant();
      const other = await newTenant();
      const bytes = await png("#336699");
      const logo = await platform((tx) =>
        uploadAsset(tx, store, tenant.id, { bytes, kind: "other", uploadedByUserId: null }),
      );
      const foreign = await platform((tx) =>
        uploadAsset(tx, store, other.id, { bytes, kind: "other", uploadedByUserId: null }),
      );
      const category = await platform((tx) =>
        saveCategory(tx, tenant.id, {
          name: "Formations",
          isTraining: true,
          logoAssetIds: [logo.id, logo.id],
        }),
      );
      expect(category.isTraining).toBe(true);
      expect(category.logoAssetIds).toEqual([logo.id]);
      expect(
        await errorCode(
          platform((tx) =>
            saveCategory(tx, tenant.id, { name: "Formations", logoAssetIds: [foreign.id] }, category.id),
          ),
        ),
      ).toBe("invalid");
      // Champs absents : inchangés.
      const renamed = await platform((tx) =>
        saveCategory(tx, tenant.id, { name: "Nos formations" }, category.id),
      );
      expect(renamed.isTraining).toBe(true);
      expect(renamed.logoAssetIds).toEqual([logo.id]);
      const second = await platform((tx) =>
        uploadAsset(tx, store, tenant.id, { bytes, kind: "other", uploadedByUserId: null }),
      );
      const added = await platform((tx) => addCategoryLogo(tx, tenant.id, category.id, second.id));
      expect(added.logoAssetIds).toEqual([logo.id, second.id]);
      expect(await errorCode(platform((tx) => addCategoryLogo(tx, tenant.id, category.id, foreign.id)))).toBe(
        "invalid",
      );
    });

    it("refuse un fichier qui n'est pas une image", async () => {
      const tenant = await newTenant();
      expect(
        await errorCode(
          platform((tx) =>
            uploadAsset(tx, store, tenant.id, {
              bytes: new TextEncoder().encode("nope"),
              kind: "gallery",
              uploadedByUserId: null,
            }),
          ),
        ),
      ).toBe("image_unsupported");
    });

    it("Basic : 5 photos maximum ; le logo ne compte pas", async () => {
      const tenant = await newTenant("basic");
      for (let i = 0; i < 5; i++) {
        await platform(async (tx) =>
          uploadAsset(tx, store, tenant.id, {
            bytes: await png("#111111"),
            kind: "gallery",
            uploadedByUserId: null,
          }),
        );
      }
      expect(
        await errorCode(
          platform(async (tx) =>
            uploadAsset(tx, store, tenant.id, {
              bytes: await png("#222222"),
              kind: "gallery",
              uploadedByUserId: null,
            }),
          ),
        ),
      ).toBe("quota_reached");
      const logo = await platform(async (tx) => uploadLogo(tx, store, tenant.id, await png("#e8503f"), null));
      expect(logo.palette.primary).toMatch(/^#e[0-9a-f]/);
    });

    it("une photo retirée reste récupérable, dans la limite du pack", async () => {
      const tenant = await newTenant("basic");
      const first = await platform(async (tx) =>
        uploadAsset(tx, store, tenant.id, {
          bytes: await png("#111111"),
          kind: "gallery",
          uploadedByUserId: null,
        }),
      );
      await platform((tx) => retireAsset(tx, tenant.id, first.id));
      const retired = await platform((tx) => listRetiredAssets(tx, tenant.id));
      expect(retired.map((a) => a.id)).toEqual([first.id]);
      expect(retired[0].purgeAfter!.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
      for (let i = 0; i < 5; i++) {
        await platform(async (tx) =>
          uploadAsset(tx, store, tenant.id, {
            bytes: await png("#333333"),
            kind: "gallery",
            uploadedByUserId: null,
          }),
        );
      }
      expect(await errorCode(platform((tx) => restoreAsset(tx, tenant.id, first.id)))).toBe("quota_reached");
    });

    it("un nouveau logo met l'ancien de côté", async () => {
      const tenant = await newTenant();
      const a = await platform(async (tx) => uploadLogo(tx, store, tenant.id, await png("#e8503f"), null));
      const b = await platform(async (tx) => uploadLogo(tx, store, tenant.id, await png("#1b2a4a"), null));
      const active = await platform((tx) => listActiveAssets(tx, tenant.id));
      expect(active.map((asset) => asset.id)).toEqual([b.assetId]);
      await platform((tx) => restoreAsset(tx, tenant.id, a.assetId));
      const overview = await platform((tx) => getTenantOverview(tx, tenant.id));
      expect(overview?.tenant.brand.logoAssetId).toBe(a.assetId);
    });
  });

  describe("modules utilisables par la gérante (isolation par la base)", () => {
    it("les mêmes fonctions marchent avec le rôle tenant, et seulement pour son tenant", async () => {
      const mine = await newTenant();
      const other = await newTenant();
      await withTenant(
        mine.id,
        (tx) => saveService(tx, mine.id, { name: "Massage", durationMinutes: 60, price: "70" }),
        app,
      );
      expect(await withTenant(mine.id, (tx) => listServices(tx, mine.id), app)).toHaveLength(1);
      // Tenter d'écrire chez un autre tenant échoue : la base ne le « voit » même pas.
      expect(
        await errorCode(
          withTenant(
            mine.id,
            (tx) => saveService(tx, other.id, { name: "X", durationMinutes: 30, price: "1" }),
            app,
          ),
        ),
      ).toBe("not_found");
    });
  });

  describe("lectures de l'admin", () => {
    it("recherche par nom, filtre par pack, fiche et chiffres du tableau de bord", async () => {
      const tenant = await newTenant("serenite", { name: "Spa Zéphyr Unique" });
      const found = await platform((tx) => listTenants(tx, { q: "zéphyr unique" }));
      expect(found.map((row) => row.id)).toEqual([tenant.id]);
      const filtered = await platform((tx) => listTenants(tx, { plan: "serenite", status: "draft" }));
      expect(filtered.every((row) => row.planCode === "serenite" && row.status === "draft")).toBe(true);
      const overview = await platform((tx) => getTenantOverview(tx, tenant.id));
      expect(overview?.managers).toHaveLength(1);
      expect(overview?.counts).toEqual({ services: 0, members: 0, photos: 0 });
      const stats = await platform((tx) => getDashboardStats(tx));
      expect(stats.drafts).toBeGreaterThan(0);
      expect(stats.byPlan.map((plan) => plan.code)).toEqual([
        "basic",
        "starter",
        "pro",
        "business",
        "essentiel",
        "serenite",
        "express",
        "vitrine",
        "signature",
      ]);
    });
  });
});
