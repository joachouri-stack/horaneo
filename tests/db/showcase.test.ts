import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@/db/access";
import type { Transaction } from "@/db/client";
import { setPlatformSetting } from "@/modules/settings";
import {
  addShowcaseEntry,
  listShowcase,
  removeShowcaseEntry,
  SHOWCASE_MAX,
} from "@/modules/showcase/showcase";
import { hasTestDatabase, openAppDb, type TestDb } from "../setup/db";

/** « Ils nous font confiance » : témoignages saisis par l'administratrice (réglage général). */
describe.skipIf(!hasTestDatabase)("témoignages de l'accueil", () => {
  let app: TestDb;
  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  const entry = {
    name: "Ma Beauté Institut",
    activity: "Institut de beauté, Avignon",
    url: "https://mabeauteinstitut.fr",
    quote: "Mes clientes réservent toutes seules, même le soir.",
    author: "Laïla, gérante",
  };

  beforeAll(async () => {
    app = openAppDb();
    await platform((tx) => setPlatformSetting(tx, "showcase", []));
  });

  afterAll(async () => {
    await platform((tx) => setPlatformSetting(tx, "showcase", []));
    await app?.$client.end();
  });

  it("ajoute, liste dans l'ordre et retire un témoignage ; site facultatif", async () => {
    expect(await platform(listShowcase)).toEqual([]);
    const first = await platform((tx) => addShowcaseEntry(tx, entry));
    const second = await platform((tx) => addShowcaseEntry(tx, { ...entry, name: "Atelier Léa", url: "" }));
    expect(second.url).toBeNull();
    expect((await platform(listShowcase)).map((item) => item.name)).toEqual([
      "Ma Beauté Institut",
      "Atelier Léa",
    ]);
    await platform((tx) => removeShowcaseEntry(tx, first.id));
    expect((await platform(listShowcase)).map((item) => item.id)).toEqual([second.id]);
  });

  it("refuse un témoignage incomplet, une adresse invalide et au-delà du maximum", async () => {
    await platform((tx) => setPlatformSetting(tx, "showcase", []));
    await expect(platform((tx) => addShowcaseEntry(tx, { ...entry, quote: "Bien" }))).rejects.toThrow();
    await expect(
      platform((tx) => addShowcaseEntry(tx, { ...entry, url: "pas une adresse" })),
    ).rejects.toThrow();
    for (let i = 0; i < SHOWCASE_MAX; i += 1) await platform((tx) => addShowcaseEntry(tx, entry));
    await expect(platform((tx) => addShowcaseEntry(tx, entry))).rejects.toMatchObject({
      code: "quota_reached",
    });
  });
});
