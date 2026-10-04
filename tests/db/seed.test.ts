import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { platformSettings, plans } from "@/db/schema";
import { seed } from "@/db/seed";
import { hasTestDatabase, openTestDb, testDatabaseUrl, type TestDb } from "../setup/db";

describe.skipIf(!hasTestDatabase)("valeurs de départ en base", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await openTestDb();
  });

  afterAll(async () => {
    await db?.$client.end();
  });

  it("insère les trois packs", async () => {
    const rows = await db.select().from(plans);
    expect(rows.map((plan) => plan.code).sort()).toEqual(["basic", "essentiel", "serenite"]);
  });

  it("peut être relancé sans doublon ni écrasement des réglages modifiés", async () => {
    await db
      .update(platformSettings)
      .set({ value: 7 })
      .where(sql`key = 'go_live_delay_days'`);
    await seed(testDatabaseUrl!);
    expect(await db.select().from(plans)).toHaveLength(3);
    const [delay] = await db
      .select()
      .from(platformSettings)
      .where(sql`key = 'go_live_delay_days'`);
    expect(delay.value).toBe(7);
  });
});
