import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { appointments, businessSettings, customers, messageLog, promoCodes } from "@/db/schema";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { optOutOfMarketing, readUnsubscribeToken } from "@/modules/customers/unsubscribe";
import { dispatchMessages } from "@/modules/messages/dispatch";
import { queueWinbacks } from "@/modules/messages/schedule";
import { setWinback, winbackConfig } from "@/modules/promo/winback";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeSenders } from "../setup/fake-senders";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Relance des clients qui ne reviennent plus, sur vraie base. « Maintenant » = lundi
 * 5 octobre 2026 à Paris ; l'e-mail part à partir de 10 h (réglage par défaut).
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "10:30", TZ);
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe.skipIf(!hasTestDatabase)("relance des clients qui ne reviennent plus", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const fake = createFakeSenders();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function setup(enabled = true) {
    n += 1;
    const slug = `relance-${n}-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, {
        name: `Institut Lys ${n}`,
        slug,
        planCode: "serenite",
        managerEmail: `${slug}@example.com`,
      }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    const lea = await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    if (enabled)
      await owner
        .update(businessSettings)
        .set({ winbackEnabled: true })
        .where(eq(businessSettings.businessId, business.id));
    return { id, slug, name: tenant.name, businessId: business.id, lea };
  }
  type Setup = Awaited<ReturnType<typeof setup>>;

  /** Client avec des rendez-vous (dates données), accord pour les offres par défaut. */
  async function addCustomer(
    s: Setup,
    visits: { at: Date; status?: "attended" | "confirmed" | "cancelled" }[],
    values: Partial<typeof customers.$inferInsert> = {},
  ) {
    n += 1;
    const [customer] = await owner
      .insert(customers)
      .values({
        tenantId: s.id,
        businessId: s.businessId,
        firstName: "Camille",
        email: `camille-${n}-${Date.now().toString(36)}@example.com`,
        emailConsent: true,
        ...values,
      })
      .returning();
    for (const visit of visits) {
      await owner.insert(appointments).values({
        tenantId: s.id,
        businessId: s.businessId,
        customerId: customer.id,
        staffId: s.lea.id,
        startsAt: visit.at,
        endsAt: new Date(visit.at.getTime() + 3_600_000),
        blockedUntil: new Date(visit.at.getTime() + 3_600_000),
        status: visit.status ?? "attended",
        source: "manual",
        totalCents: 7000,
      });
    }
    return customer;
  }

  const winbackMessages = (tenantId: string) =>
    owner
      .select()
      .from(messageLog)
      .where(and(eq(messageLog.tenantId, tenantId), eq(messageLog.templateKey, "customer.winback")));

  it("relance une fois les clients absents depuis le délai, qui ont accepté les offres", async () => {
    const s = await setup();
    const absent = await addCustomer(s, [{ at: daysAgo(200) }, { at: daysAgo(90) }]);
    // Pas d'accord pour les offres, venue trop récente, rendez-vous déjà prévu,
    // absente depuis trop longtemps, sans e-mail, rendez-vous seulement annulé.
    await addCustomer(s, [{ at: daysAgo(91) }], { emailConsent: false });
    await addCustomer(s, [{ at: daysAgo(20) }]);
    await addCustomer(s, [
      { at: daysAgo(92) },
      { at: new Date(NOW.getTime() + 5 * 86_400_000), status: "confirmed" },
    ]);
    await addCustomer(s, [{ at: daysAgo(500) }]);
    await addCustomer(s, [{ at: daysAgo(93) }], { email: null, phone: "+33612345678" });
    await addCustomer(s, [{ at: daysAgo(94), status: "cancelled" }]);

    // Avant l'heure d'envoi : rien.
    expect(await platform((tx) => queueWinbacks(tx, localToUtc("2026-10-05", "08:00", TZ)))).toBe(0);
    expect(await platform((tx) => queueWinbacks(tx, NOW))).toBe(1);
    // Rejouée : rien de plus (une relance par absence).
    expect(await platform((tx) => queueWinbacks(tx, new Date(NOW.getTime() + 300_000)))).toBe(0);
    expect(await platform((tx) => queueWinbacks(tx, new Date(NOW.getTime() + 86_400_000)))).toBe(0);

    const [message] = await winbackMessages(s.id);
    expect(message.data).toMatchObject({ customerId: absent.id });
    const [code] = await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id));
    expect(code).toMatchObject({ customerId: absent.id, discountValue: 10, maxUses: 1 });
    expect(code.code.startsWith("RETOUR")).toBe(true);

    // Revenue puis de nouveau absente : nouvelle relance possible.
    await owner.insert(appointments).values({
      tenantId: s.id,
      businessId: s.businessId,
      customerId: absent.id,
      staffId: s.lea.id,
      startsAt: daysAgo(70),
      endsAt: new Date(daysAgo(70).getTime() + 3_600_000),
      blockedUntil: new Date(daysAgo(70).getTime() + 3_600_000),
      status: "attended",
      source: "manual",
      totalCents: 7000,
    });
    expect(await platform((tx) => queueWinbacks(tx, new Date(NOW.getTime() + 600_000)))).toBe(1);
  });

  it("e-mail au nom de l'établissement, avec le code ; lien pour ne plus recevoir d'offres", async () => {
    const s = await setup();
    const camille = await addCustomer(s, [{ at: daysAgo(80) }]);
    await platform((tx) => queueWinbacks(tx, NOW));
    const [code] = await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id));
    const queued = await winbackMessages(s.id);
    expect(
      await dispatchMessages(platform, fake.senders, {
        productName: "Horaneo",
        appUrl: "http://localhost:3000",
        now: NOW,
        ids: queued.map((row) => row.id),
      }),
    ).toMatchObject({ sent: 1 });
    const email = fake.emails.find((item) => item.to.includes(camille.email!))!;
    expect(email.fromName).toBe(s.name);
    const text = email.text.replace(/[  ]/g, " ");
    expect(email.subject).toBe("Camille, vous nous manquez !");
    expect(text).toContain(`chez ${s.name}`);
    expect(text).toContain("10 % de réduction");
    expect(text).toContain(code.code);
    expect(text).toContain(`http://${s.slug}.localhost:3000/reserver`);
    const link = /\/desabonnement\?t=(\S+)/.exec(text);
    expect(link).not.toBeNull();
    expect(readUnsubscribeToken(link![1])).toEqual({ businessId: s.businessId, customerId: camille.id });
    expect(readUnsubscribeToken(`${s.businessId}.${camille.id}.faux`)).toBeNull();

    // Désinscription : plus d'accord pour les offres, plus de relance.
    expect(await withTenant(s.id, (tx) => optOutOfMarketing(tx, s.id, camille.id), app, s.businessId)).toBe(
      true,
    );
    const [after] = await owner.select().from(customers).where(eq(customers.id, camille.id));
    expect(after).toMatchObject({ emailConsent: false, smsConsent: false });
  });

  it("réglages de la gérante : délai, réduction (0 = sans code), refus hors limites", async () => {
    const s = await setup(false);
    const asTenant = <T>(fn: (tx: Transaction) => Promise<T>) => withTenant(s.id, fn, app);
    expect(await asTenant((tx) => winbackConfig(tx, s.id))).toMatchObject({
      included: true,
      enabled: false,
      afterDays: 60,
      discountPercent: 10,
    });
    await asTenant((tx) =>
      setWinback(tx, s.id, { enabled: true, afterDays: 30, discountPercent: 0, validityDays: 15 }),
    );
    await expect(
      asTenant((tx) =>
        setWinback(tx, s.id, { enabled: true, afterDays: 10, discountPercent: 0, validityDays: 15 }),
      ),
    ).rejects.toThrow();

    // Sans réduction : message sans code.
    const nina = await addCustomer(s, [{ at: daysAgo(40) }], { firstName: "Nina" });
    expect(await platform((tx) => queueWinbacks(tx, NOW))).toBe(1);
    const [message] = await winbackMessages(s.id);
    expect(message.data).toEqual({ customerId: nina.id });
    expect(await owner.select().from(promoCodes).where(eq(promoCodes.tenantId, s.id))).toHaveLength(0);
  });
});
