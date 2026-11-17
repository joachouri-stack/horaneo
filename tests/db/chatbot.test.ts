import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@/db/access";
import * as s from "@/db/schema";
import { chatbotOffered, isNewConversation, prepareChat } from "@/modules/chatbot/chat";
import { chatbotSettings, setChatbotEnabled } from "@/modules/chatbot/settings";
import { FIND_SLOTS, runChatTool } from "@/modules/chatbot/tools";
import { AppError } from "@/modules/errors";
import { createTenantWithData } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Chatbot du site : réservé aux packs qui le comprennent, informations relues à chaque question. */
describe.skipIf(!hasTestDatabase)("chatbot du site", () => {
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

  const question = (content: string) => ({ messages: [{ role: "user" as const, content }] });

  it("hors pack : pas de chatbot ; pack Business : prix à jour à chaque question", async () => {
    const { tenant, service } = await createTenantWithData(owner, "chatbot");
    const asTenant = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenant.id, fn, app);

    // Pack sans chatbot : refusé.
    expect(await asTenant((tx) => chatbotOffered(tx, tenant.id))).toBe(false);
    await expect(asTenant((tx) => prepareChat(tx, tenant.id, question("Vos horaires ?")))).rejects.toThrow(
      AppError,
    );

    // Pack Business : proposé, avec les prestations et leur prix du moment.
    const [business] = await owner.select().from(s.plans).where(eq(s.plans.code, "business"));
    await owner.update(s.tenants).set({ planId: business.id }).where(eq(s.tenants.id, tenant.id));
    expect(await asTenant((tx) => chatbotOffered(tx, tenant.id))).toBe(true);
    const before = await asTenant((tx) => prepareChat(tx, tenant.id, question("Combien coûte le soin ?")));
    expect(before.model).toMatch(/^claude-/);
    expect(before.system).toContain(service.name.fr ?? "");
    // Identifiant donné au modèle pour chercher les créneaux de la prestation.
    expect(before.system).toContain(`[id: ${service.id}]`);
    expect(before.messages).toEqual([{ role: "user", content: "Combien coûte le soin ?" }]);

    // La gérante change le prix : la question suivante voit le nouveau prix.
    await owner.update(s.services).set({ priceCents: 12345 }).where(eq(s.services.id, service.id));
    const after = await asTenant((tx) => prepareChat(tx, tenant.id, question("Et maintenant ?")));
    expect(after.system).toMatch(/123,45/);
    expect(before.system).not.toMatch(/123,45/);
  });

  it("conversation vérifiée : commence et finit par une question, longueur limitée", async () => {
    const { tenant } = await createTenantWithData(owner, "chatbot-format");
    const [business] = await owner.select().from(s.plans).where(eq(s.plans.code, "business"));
    await owner.update(s.tenants).set({ planId: business.id }).where(eq(s.tenants.id, tenant.id));
    const prepare = (raw: Parameters<typeof prepareChat>[2]) =>
      withTenant(tenant.id, (tx) => prepareChat(tx, tenant.id, raw), app);
    await expect(prepare({ messages: [{ role: "assistant", content: "Bonjour" }] })).rejects.toThrow();
    await expect(prepare(question("x".repeat(601)))).rejects.toThrow();
    await expect(
      prepare({
        messages: [
          { role: "user", content: "Bonjour" },
          { role: "assistant", content: "Bonjour !" },
        ],
      }),
    ).rejects.toThrow();
    expect(isNewConversation(question("Bonjour"))).toBe(true);
    expect(
      isNewConversation({
        messages: [
          { role: "user", content: "a" },
          { role: "assistant", content: "b" },
          { role: "user", content: "c" },
        ],
      }),
    ).toBe(false);
  });

  it("la gérante peut couper l'assistant : plus de bulle ni de réponse ; compteur du mois", async () => {
    const { tenant } = await createTenantWithData(owner, "chatbot-off");
    const [business] = await owner.select().from(s.plans).where(eq(s.plans.code, "business"));
    await owner.update(s.tenants).set({ planId: business.id }).where(eq(s.tenants.id, tenant.id));
    const asTenant = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenant.id, fn, app);

    // Activé par défaut, avec le quota du pack.
    const before = await asTenant((tx) => chatbotSettings(tx, tenant.id));
    expect(before).toMatchObject({ included: true, enabled: true, active: true });
    expect(before.usage).toMatchObject({ used: 0, included: 500 });

    await asTenant((tx) => setChatbotEnabled(tx, tenant.id, { enabled: false }));
    expect(await asTenant((tx) => chatbotOffered(tx, tenant.id))).toBe(false);
    await expect(asTenant((tx) => prepareChat(tx, tenant.id, question("Bonjour")))).rejects.toMatchObject({
      code: "chatbot_unavailable",
    });

    await asTenant((tx) => setChatbotEnabled(tx, tenant.id, { enabled: true }));
    expect(await asTenant((tx) => chatbotOffered(tx, tenant.id))).toBe(true);
  });

  it("pack sans chatbot : le réglage est refusé", async () => {
    const { tenant } = await createTenantWithData(owner, "chatbot-none");
    await expect(
      withTenant(tenant.id, (tx) => setChatbotEnabled(tx, tenant.id, { enabled: false }), app),
    ).rejects.toMatchObject({ code: "feature_unavailable" });
  });

  it("créneaux libres : heures du jour et lien Réserver prérempli ; refus si non réservable", async () => {
    const { tenant, service } = await createTenantWithData(owner, "chatbot-slots");
    const asTenant = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant(tenant.id, fn, app);
    // Vendredi 1er janvier 2027 ; l'établissement est ouvert le lundi (9 h – 18 h).
    const now = new Date("2027-01-01T08:00:00Z");
    const search = (input: unknown) => asTenant((tx) => runChatTool(tx, tenant.id, FIND_SLOTS, input, now));

    const found = await search({ service_id: service.id, from_date: "2027-01-02", days: 3 });
    expect(found.result).toContain("2027-01-04: 09:00");
    expect(found.result).not.toContain("2027-01-02");
    expect(found.link).toEqual({
      serviceId: service.id,
      serviceName: "Soin",
      date: "2027-01-04",
      href: `/reserver?prestation=${service.id}&date=2027-01-04`,
    });

    // Date passée : recherche à partir d'aujourd'hui.
    const past = await search({ service_id: service.id, from_date: "2020-01-01", days: 4 });
    expect(past.link?.date).toBe("2027-01-04");

    // Aucun jour ouvert dans la période : pas de lien.
    const none = await search({ service_id: service.id, from_date: "2027-01-05", days: 3 });
    expect(none.link).toBeNull();

    // Entrée invalide, outil inconnu : refus sans erreur.
    expect((await search({ service_id: "x", from_date: "demain", days: 30 })).link).toBeNull();
    expect((await asTenant((tx) => runChatTool(tx, tenant.id, "autre", {}, now))).link).toBeNull();

    // Prestation non réservable en ligne : pas de créneaux.
    await owner.update(s.services).set({ isOnlineBookable: false }).where(eq(s.services.id, service.id));
    const offline = await search({ service_id: service.id, from_date: "2027-01-04", days: 1 });
    expect(offline.link).toBeNull();
    expect(offline.result).toMatch(/cannot be booked online/);
  });
});
