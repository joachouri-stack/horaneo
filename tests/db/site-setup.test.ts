import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { messageLog } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { dispatchMessages } from "@/modules/messages/dispatch";
import {
  approveSite,
  getSiteSetup,
  requestSiteReview,
  siteSetupView,
  submitSetupAnswers,
} from "@/modules/setup/site-setup";
import { addCustomDomain } from "@/modules/tenants/domains";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeSenders } from "../setup/fake-senders";
import { hasTestDatabase, openAppDb, type TestDb } from "../setup/db";

/** Mise en route d'un site créé pour le client : questionnaire, validation, étapes. */
describe.skipIf(!hasTestDatabase)("mise en route du site", () => {
  let app: TestDb;
  let n = 0;
  beforeAll(() => {
    app = openAppDb();
  });
  afterAll(async () => {
    await app?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);
  const asTenant = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(tenantId, fn, app);
  const errorCode = (promise: Promise<unknown>) =>
    promise.then(
      () => null,
      (error) => (error instanceof AppError ? error.code : String(error)),
    );

  async function newTenant(planCode: string) {
    n += 1;
    const slug = `mise-en-route-${Date.now()}-${n}`;
    const { tenant } = await platform((tx) =>
      createTenant(tx, { name: `Institut ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    return tenant;
  }

  it("pack payant : suivi ouvert, questionnaire, validation après présentation, puis en ligne", async () => {
    const tenant = await newTenant("pro");
    const site = { customDomain: true, status: "draft" };
    const start = await asTenant(tenant.id, (tx) => siteSetupView(tx, tenant.id, site));
    expect(start?.steps.map((step) => [step.key, step.state])).toEqual([
      ["info", "current"],
      ["building", "todo"],
      ["review", "todo"],
      ["domain", "todo"],
      ["online", "todo"],
    ]);

    // Questionnaire : l'activité est obligatoire ; les réponses sont gardées et modifiables.
    expect(
      await errorCode(asTenant(tenant.id, (tx) => submitSetupAnswers(tx, tenant.id, { activity: " " }))),
    ).toBe("invalid");
    await asTenant(tenant.id, (tx) =>
      submitSetupAnswers(tx, tenant.id, { activity: "Soins du visage", domain: "institut-lea.fr" }),
    );
    const sent = await asTenant(tenant.id, (tx) => getSiteSetup(tx, tenant.id));
    expect(sent?.answers).toMatchObject({ activity: "Soins du visage", domain: "institut-lea.fr" });
    expect(sent?.submittedAt).not.toBeNull();

    // Pas de validation avant que l'équipe présente le site.
    expect(await errorCode(asTenant(tenant.id, (tx) => approveSite(tx, tenant.id)))).toBe("invalid");
    await platform((tx) => requestSiteReview(tx, tenant.id));
    const review = await asTenant(tenant.id, (tx) => siteSetupView(tx, tenant.id, site));
    expect(review?.steps.find((step) => step.state === "current")?.key).toBe("review");

    await asTenant(tenant.id, (tx) => approveSite(tx, tenant.id));
    // Site validé : le questionnaire n'est plus modifiable.
    expect(
      await errorCode(asTenant(tenant.id, (tx) => submitSetupAnswers(tx, tenant.id, { activity: "Autre" }))),
    ).toBe("invalid");

    await platform((tx) => changeStatus(tx, tenant.id, "activate"));
    const live = await asTenant(tenant.id, (tx) =>
      siteSetupView(tx, tenant.id, { customDomain: false, status: "active" }),
    );
    expect(live?.complete).toBe(true);
  });

  it("e-mails : l'équipe à la réception du questionnaire (une fois), le client quand son site est prêt", async () => {
    const tenant = await newTenant("pro");
    await asTenant(tenant.id, (tx) => submitSetupAnswers(tx, tenant.id, { activity: "Soins" }));
    await asTenant(tenant.id, (tx) => submitSetupAnswers(tx, tenant.id, { activity: "Soins du visage" }));
    await platform((tx) => requestSiteReview(tx, tenant.id));
    const rows = await platform((tx) =>
      tx
        .select({ id: messageLog.id, templateKey: messageLog.templateKey })
        .from(messageLog)
        .where(and(eq(messageLog.tenantId, tenant.id), eq(messageLog.channel, "email"))),
    );
    expect(rows.filter((row) => row.templateKey === "admin.setup_submitted")).toHaveLength(1);
    expect(rows.filter((row) => row.templateKey === "manager.site_review")).toHaveLength(1);

    const fake = createFakeSenders();
    await dispatchMessages(platform, fake.senders, {
      productName: "Sirine",
      appUrl: "http://localhost:3000",
      ids: rows.filter((row) => row.templateKey === "manager.site_review").map((row) => row.id),
    });
    const email = fake.emails.find((item) => item.subject.includes("prêt"));
    expect(email?.to).toEqual([`${tenant.slug}@example.com`]);
    expect(email?.html).toContain(`/espace/${tenant.id}/mise-en-route`);
  });

  it("pack gratuit : pas de suivi ni de nom de domaine propre", async () => {
    const tenant = await newTenant("basic");
    expect(await asTenant(tenant.id, (tx) => getSiteSetup(tx, tenant.id))).toBeNull();
    expect(await errorCode(platform((tx) => addCustomDomain(tx, tenant.id, "institut.example.fr")))).toBe(
      "feature_unavailable",
    );
  });

  it("un site ne voit pas la mise en route d'un autre", async () => {
    const a = await newTenant("pro");
    const b = await newTenant("pro");
    expect(await asTenant(a.id, (tx) => getSiteSetup(tx, b.id))).toBeNull();
    expect(await errorCode(asTenant(a.id, (tx) => submitSetupAnswers(tx, b.id, { activity: "x" })))).toBe(
      "not_found",
    );
  });
});
