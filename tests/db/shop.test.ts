import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { createLocalStorage } from "@/lib/storage/local";
import type { FileStorage } from "@/lib/storage/types";
import { createBusiness } from "@/modules/businesses/businesses";
import { AppError } from "@/modules/errors";
import { listActiveAssets, uploadAsset } from "@/modules/media/assets";
import { countUsage } from "@/modules/quotas";
import {
  deleteProduct,
  listProducts,
  moveProduct,
  saveProduct,
  setProductPhoto,
} from "@/modules/shop/products";
import { priceCart, shopProduct, shopProducts } from "@/modules/shop/catalog";
import { createTenant } from "@/modules/tenants/create";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Boutique (solution Commerce) : catalogue de produits de la gérante. */
describe.skipIf(!hasTestDatabase)("boutique : catalogue de produits", () => {
  let owner: TestDb;
  let app: TestDb;
  let store: FileStorage;
  let dir: string;
  let n = 0;

  beforeAll(async () => {
    // Connexion propriétaire : prépare les valeurs de départ (packs).
    owner = await openTestDb();
    app = openAppDb();
    dir = await mkdtemp(path.join(tmpdir(), "horaneo-shop-"));
    store = createLocalStorage(dir);
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
    await rm(dir, { recursive: true, force: true });
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>, businessId?: string) =>
    withPlatform(fn, app, businessId);
  const asManager = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>, businessId?: string) =>
    withTenant(tenantId, fn, app, businessId);
  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return null;
    } catch (error) {
      return error instanceof AppError ? error.code : String(error);
    }
  }

  async function newTenant(planCode: string) {
    n += 1;
    const slug = `shop-${n}-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, { name: `Boutique ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    return { ...tenant, primaryBusinessId: business.id };
  }

  it("refusée sur un pack sans boutique", async () => {
    const tenant = await newTenant("starter");
    expect(
      await errorCode(
        asManager(tenant.id, (tx) => saveProduct(tx, tenant.id, { name: "Sérum", price: "29" })),
      ),
    ).toBe("feature_unavailable");
  });

  it("crée, modifie, range et supprime un produit (prix, stock, mise en vente)", async () => {
    const tenant = await newTenant("pro");
    const serum = await asManager(tenant.id, (tx) =>
      saveProduct(tx, tenant.id, { name: "Sérum éclat", description: "30 ml", price: "29,90", stock: "12" }),
    );
    expect(serum).toMatchObject({ name: { fr: "Sérum éclat" }, priceCents: 2990, stockQuantity: 12 });
    const candle = await asManager(tenant.id, (tx) =>
      saveProduct(tx, tenant.id, { name: "Bougie", price: "19", stock: "" }),
    );
    // Stock vide : non suivi.
    expect(candle.stockQuantity).toBeNull();
    // Stock et prix invalides refusés.
    expect(
      await errorCode(
        asManager(tenant.id, (tx) => saveProduct(tx, tenant.id, { name: "X", price: "29", stock: "-1" })),
      ),
    ).not.toBeNull();
    expect(
      await errorCode(asManager(tenant.id, (tx) => saveProduct(tx, tenant.id, { name: "X", price: "abc" }))),
    ).not.toBeNull();

    const updated = await asManager(tenant.id, (tx) =>
      saveProduct(tx, tenant.id, { name: "Sérum éclat", price: "32", stock: "0", isActive: false }, serum.id),
    );
    expect(updated).toMatchObject({ priceCents: 3200, stockQuantity: 0, isActive: false });

    await asManager(tenant.id, (tx) => moveProduct(tx, tenant.id, candle.id, "up"));
    expect((await asManager(tenant.id, (tx) => listProducts(tx, tenant.id))).map((p) => p.id)).toEqual([
      candle.id,
      serum.id,
    ]);

    await asManager(tenant.id, (tx) => deleteProduct(tx, tenant.id, serum.id));
    expect(await asManager(tenant.id, (tx) => listProducts(tx, tenant.id))).toHaveLength(1);
  });

  it("photo d'un produit : hors des photos de la galerie, l'ancienne est mise de côté", async () => {
    const tenant = await newTenant("pro");
    const product = await asManager(tenant.id, (tx) =>
      saveProduct(tx, tenant.id, { name: "Coffret", price: "45" }),
    );
    const png = new Uint8Array(
      await sharp({ create: { width: 400, height: 400, channels: 3, background: "#e8d5bd" } })
        .png()
        .toBuffer(),
    );
    const upload = () =>
      asManager(tenant.id, (tx) =>
        uploadAsset(tx, store, tenant.id, { bytes: png, kind: "product", uploadedByUserId: null }),
      );
    const first = await upload();
    await asManager(tenant.id, (tx) => setProductPhoto(tx, tenant.id, product.id, first.id));
    const second = await upload();
    await asManager(tenant.id, (tx) => setProductPhoto(tx, tenant.id, product.id, second.id));

    const [listed] = await asManager(tenant.id, (tx) => listProducts(tx, tenant.id));
    expect(listed.photoAssetId).toBe(second.id);
    expect(listed.photoKey).toBe(second.storageKey);
    // Ni dans la page Photos, ni dans le nombre de photos du pack.
    expect(await asManager(tenant.id, (tx) => listActiveAssets(tx, tenant.id, { photosOnly: true }))).toEqual(
      [],
    );
    expect(await asManager(tenant.id, (tx) => countUsage(tx, tenant.id, "photos"))).toBe(0);
    const active = await asManager(tenant.id, (tx) => listActiveAssets(tx, tenant.id));
    expect(active.map((asset) => asset.id)).toEqual([second.id]);
  });

  it("chaque entreprise du site a son propre catalogue", async () => {
    const tenant = await newTenant("business");
    const { business: other } = await platform((tx) =>
      createBusiness(tx, tenant.id, {
        name: "Seconde boutique",
        managerEmail: `b-${tenant.slug}@example.com`,
      }),
    );
    await platform((tx) => saveProduct(tx, tenant.id, { name: "Sac en toile", price: "25" }), other.id);
    const primary = await asManager(tenant.id, (tx) => listProducts(tx, tenant.id), tenant.primaryBusinessId);
    expect(primary).toEqual([]);
    const second = await asManager(tenant.id, (tx) => listProducts(tx, tenant.id), other.id);
    expect(second.map((p) => p.name.fr)).toEqual(["Sac en toile"]);
  });

  it("site public : seuls les produits en vente ; le panier relit prix et stock en base", async () => {
    const tenant = await newTenant("pro");
    const as = <T>(fn: (tx: Transaction) => Promise<T>) => asManager(tenant.id, fn, tenant.primaryBusinessId);
    const serum = await as((tx) =>
      saveProduct(tx, tenant.id, { name: "Sérum", category: " Soins visage ", price: "29,90", stock: "3" }),
    );
    const candle = await as((tx) => saveProduct(tx, tenant.id, { name: "Bougie", price: "19" }));
    const hidden = await as((tx) =>
      saveProduct(tx, tenant.id, { name: "Ancien", price: "10", isActive: false }),
    );
    // Lecture comme le site public (sans entreprise déclarée par la gérante).
    const site = <T>(fn: (tx: Transaction) => Promise<T>) =>
      withTenant(tenant.id, fn, app, tenant.primaryBusinessId);
    const listed = await site((tx) => shopProducts(tx, tenant.id, tenant.primaryBusinessId, "fr"));
    expect(listed.map((p) => [p.name, p.category])).toEqual([
      ["Sérum", "Soins visage"],
      ["Bougie", null],
    ]);
    expect(
      await errorCode(site((tx) => shopProduct(tx, tenant.id, tenant.primaryBusinessId, hidden.id, "fr"))),
    ).toBe("not_found");

    const cart = await site((tx) =>
      priceCart(
        tx,
        tenant.id,
        tenant.primaryBusinessId,
        [
          { productId: serum.id, quantity: 2 },
          { productId: candle.id, quantity: 1 },
          { productId: serum.id, quantity: 1 },
          { productId: hidden.id, quantity: 1 },
        ],
        "fr",
      ),
    );
    // Doublon additionné (3 sérums), produit masqué retiré, total recalculé.
    expect(cart.lines.map((line) => [line.product.name, line.quantity, line.ok])).toEqual([
      ["Sérum", 3, true],
      ["Bougie", 1, true],
    ]);
    expect(cart.removed).toEqual([hidden.id]);
    expect(cart.totalCents).toBe(3 * 2990 + 1900);
    expect(cart.ready).toBe(true);
    // Plus que le stock : le panier n'est pas prêt.
    const tooMany = await site((tx) =>
      priceCart(tx, tenant.id, tenant.primaryBusinessId, [{ productId: serum.id, quantity: 4 }], "fr"),
    );
    expect(tooMany.ready).toBe(false);
    expect(tooMany.lines[0]).toMatchObject({ ok: false, available: 3 });
  });
});
