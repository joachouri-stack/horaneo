import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/db/access";
import { businessSettings } from "@/db/schema";
import { setBreakMinutes } from "@/modules/booking/settings";
import { createTenantWithData } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Pause entre deux rendez-vous, réglée depuis l'agenda. */
describe.skipIf(!hasTestDatabase)("pause entre deux rendez-vous", () => {
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

  it("enregistre une durée proposée, refuse les autres", async () => {
    const { tenant, business } = await createTenantWithData(owner, "pause-agenda");
    await withTenant(tenant.id, (tx) => setBreakMinutes(tx, tenant.id, { breakMinutes: 15 }), app);
    const [settings] = await owner
      .select({ breakMinutes: businessSettings.breakMinutes })
      .from(businessSettings)
      .where(eq(businessSettings.businessId, business.id));
    expect(settings.breakMinutes).toBe(15);
    await expect(
      withTenant(tenant.id, (tx) => setBreakMinutes(tx, tenant.id, { breakMinutes: 7 }), app),
    ).rejects.toThrow();
  });
});
