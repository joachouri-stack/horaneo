import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PLAN_OPTIONS } from "@/config/defaults";
import { launchOffers, planOptions, platformSettings, plans } from "@/db/schema";
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

  it("insère les packs Basic, Pro et Business, et garde les anciens packs hors vente", async () => {
    const rows = await db.select().from(plans);
    expect(rows.map((plan) => plan.code).sort()).toEqual([
      "basic",
      "business",
      "essentiel",
      "express",
      "pro",
      "serenite",
      "signature",
      "vitrine",
    ]);
    const sold = rows.filter((plan) => plan.isPublic).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(sold.map((plan) => [plan.code, plan.priceCents])).toEqual([
      ["basic", 0],
      ["pro", 3990],
      ["business", 7900],
    ]);
    // Aucuns frais de création, réservation incluse dans les trois packs.
    for (const plan of sold) {
      expect(plan.noCommitmentFeeCents).toBeNull();
      expect(plan.features.onlineBooking).toBe(true);
    }
    // Offre tablette : rattachée au Business, 100 places.
    const [offer] = await db.select().from(launchOffers);
    expect(offer).toMatchObject({ quota: 100, requiresCommitment: true, isActive: true });
    expect(offer.planId).toBe(rows.find((plan) => plan.code === "business")!.id);
  });

  it("insère les options sans inventer de tarif", async () => {
    const rows = await db.select().from(planOptions);
    expect(rows.map((option) => option.code)).toContain("booking");
    expect(rows.every((option) => option.priceCents === null)).toBe(true);
  });

  it("peut être relancé sans doublon ni écrasement des réglages modifiés", async () => {
    await db
      .update(platformSettings)
      .set({ value: 7 })
      .where(sql`key = 'go_live_delay_days'`);
    await seed(testDatabaseUrl!);
    expect(await db.select().from(plans)).toHaveLength(8);
    expect(await db.select().from(launchOffers)).toHaveLength(1);
    expect(await db.select().from(planOptions)).toHaveLength(DEFAULT_PLAN_OPTIONS.length);
    const [delay] = await db
      .select()
      .from(platformSettings)
      .where(sql`key = 'go_live_delay_days'`);
    expect(delay.value).toBe(7);
    await db
      .update(platformSettings)
      .set({ value: 5 })
      .where(sql`key = 'go_live_delay_days'`);
  });

  it("complète un pack existant sans écraser ce qui a été modifié", async () => {
    await db.execute(sql`
      UPDATE plans SET description = NULL,
        features = (features - 'monthlyUpdate') || '{"stats": true}'::jsonb
      WHERE code = 'essentiel'`);
    await seed(testDatabaseUrl!);
    const [plan] = await db
      .select()
      .from(plans)
      .where(sql`code = 'essentiel'`);
    expect(plan.description?.fr).toBeTruthy();
    expect(plan.features.monthlyUpdate).toBe(true);
    expect(plan.features.stats).toBe(true);
    await db.execute(
      sql`UPDATE plans SET features = features || '{"stats": false}'::jsonb WHERE code = 'essentiel'`,
    );
  });
});
