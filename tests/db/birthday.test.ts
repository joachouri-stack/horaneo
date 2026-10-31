import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings, customers, messageLog, promoCodes } from "@/db/schema";
import { createManualAppointment } from "@/modules/agenda/actions";
import { createBusiness } from "@/modules/businesses/businesses";
import { createBooking, type BookingInput } from "@/modules/booking/create";
import { localToUtc } from "@/modules/booking/time";
import { saveService } from "@/modules/catalog/services";
import { saveCustomer } from "@/modules/customers/customers";
import { AppError } from "@/modules/errors";
import { dispatchMessages } from "@/modules/messages/dispatch";
import { queueBirthdayOffers } from "@/modules/messages/schedule";
import { hasActivePromoCodes, listPromoCodes } from "@/modules/promo/codes";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeGateway } from "../setup/fake-gateway";
import { createFakeSenders } from "../setup/fake-senders";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Offre d'anniversaire sur vraie base : tâche du jour (un message et un code par
 * cliente et par an), 29 février, code personnel réservé à sa cliente, date
 * jamais remplacée en ligne, contenu de l'e-mail. « Maintenant » = lundi 5 octobre
 * 2026 à Paris ; l'e-mail part à partir de 9 h (réglage par défaut).
 */
const TZ = "Europe/Paris";
const at = (date: string, time = "09:30") => localToUtc(date, time, TZ);
const NOW = at("2026-10-05", "09:00");
const TODAY = "2026-10-05";

describe.skipIf(!hasTestDatabase)("offre d'anniversaire", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const gateway = createFakeGateway();
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
  const asTenant = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(tenantId, fn, app);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  /** Établissement ouvert le mardi, Léa fait le massage (70 €) ; offre d'anniversaire activée ou non. */
  async function setup({ planCode = "serenite", offer = true } = {}) {
    n += 1;
    const slug = `anniv-${n}-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, { name: `Institut Rose ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
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
    if (offer)
      await owner
        .update(businessSettings)
        .set({ birthdayOfferEnabled: true })
        .where(eq(businessSettings.businessId, business.id));
    return { id, slug, name: tenant.name, businessId: business.id, massage, lea };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  async function addCustomer(
    s: Setup,
    values: Partial<typeof customers.$inferInsert> & { birthMonth: number | null; birthDay: number | null },
  ) {
    n += 1;
    const [row] = await owner
      .insert(customers)
      .values({
        tenantId: s.id,
        businessId: s.businessId,
        firstName: "Camille",
        email: `camille-${n}-${Date.now().toString(36)}@example.com`,
        ...values,
      })
      .returning();
    return row;
  }

  const birthdayMessages = (tenantId: string) =>
    owner
      .select()
      .from(messageLog)
      .where(and(eq(messageLog.tenantId, tenantId), eq(messageLog.templateKey, "customer.birthday")));
  const personalCodes = (tenantId: string) =>
    owner.select().from(promoCodes).where(eq(promoCodes.tenantId, tenantId));

  function book(
    s: Setup,
    customer: Partial<BookingInput["customer"]>,
    input: Partial<BookingInput> = {},
    source: "online" | "manual" = "online",
  ) {
    return asTenant(s.id, (tx) =>
      createBooking(
        tx,
        s.id,
        {
          serviceIds: [s.massage.id],
          staffId: null,
          start: localToUtc("2026-10-06", "10:00", TZ),
          customer: { firstName: "Camille", email: "x@example.com", phone: "06 12 34 56 78", ...customer },
          ...input,
        },
        { now: NOW, gateway: gateway.gateway, source },
      ),
    );
  }

  describe("tâche du jour", () => {
    it("un seul message et un seul code par cliente et par an, à partir de l'heure réglée", async () => {
      const s = await setup();
      const camille = await addCustomer(s, { birthMonth: 10, birthDay: 5 });
      await addCustomer(s, { birthMonth: 10, birthDay: 6 });
      // Avant 9 h : rien.
      expect(await platform((tx) => queueBirthdayOffers(tx, at(TODAY, "08:00")))).toBe(0);
      expect(await birthdayMessages(s.id)).toHaveLength(0);
      // À 9 h 30, puis rejoué deux fois dans la matinée : un seul message, un seul code.
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY, "09:30")));
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY, "09:35")));
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY, "11:00")));
      const messages = await birthdayMessages(s.id);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        businessId: s.businessId,
        channel: "email",
        dedupeKey: `customer.birthday:${camille.id}:2026`,
      });
      const codes = await personalCodes(s.id);
      expect(codes).toHaveLength(1);
      expect(codes[0]).toMatchObject({
        customerId: camille.id,
        discountType: "percent",
        discountValue: 20,
        maxUses: 1,
        usedCount: 0,
        validFrom: localToUtc(TODAY, "00:00", TZ),
        // 30 jours de validité : jusqu'au 4 novembre au soir (fin exclusive : minuit le 5).
        validUntil: localToUtc("2026-11-05", "00:00", TZ),
      });
      expect(codes[0].code).toMatch(/^ANNIV-[A-HJ-NP-Z2-9]{6}$/);
      expect((messages[0].data as { promoCodeId: string }).promoCodeId).toBe(codes[0].id);
      // Codes personnels : absents de la liste de la gérante, mais le champ « code promo » s'affiche.
      expect(await asTenant(s.id, (tx) => listPromoCodes(tx, s.id))).toHaveLength(0);
      expect(await asTenant(s.id, (tx) => hasActivePromoCodes(tx, s.id))).toBe(true);
      // L'année suivante : un nouveau message, un nouveau code.
      await platform((tx) => queueBirthdayOffers(tx, at("2027-10-05")));
      expect(await birthdayMessages(s.id)).toHaveLength(2);
      expect(await personalCodes(s.id)).toHaveLength(2);
    });

    it("rien si l'offre est coupée, si le pack n'a pas les codes promo, ni pour une cliente effacée ou sans e-mail", async () => {
      const off = await setup({ offer: false });
      await addCustomer(off, { birthMonth: 10, birthDay: 5 });
      const noPromo = await setup({ planCode: "starter" });
      await addCustomer(noPromo, { birthMonth: 10, birthDay: 5 });
      const s = await setup();
      await addCustomer(s, { birthMonth: 10, birthDay: 5, anonymizedAt: NOW, email: null });
      await addCustomer(s, { birthMonth: 10, birthDay: 5, email: null, phone: "+33612345678" });
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY)));
      for (const tenant of [off, noPromo, s]) {
        expect(await birthdayMessages(tenant.id)).toHaveLength(0);
        expect(await personalCodes(tenant.id)).toHaveLength(0);
      }
    });

    it("les clientes nées un 29 février sont fêtées le 28 les années non bissextiles", async () => {
      const s = await setup();
      const leap = await addCustomer(s, { birthMonth: 2, birthDay: 29 });
      await addCustomer(s, { birthMonth: 2, birthDay: 28 });
      await platform((tx) => queueBirthdayOffers(tx, at("2027-02-27")));
      expect(await birthdayMessages(s.id)).toHaveLength(0);
      // 2027 n'est pas bissextile : le 28 fête les deux clientes.
      await platform((tx) => queueBirthdayOffers(tx, at("2027-02-28")));
      expect((await birthdayMessages(s.id)).map((row) => row.dedupeKey)).toContain(
        `customer.birthday:${leap.id}:2027`,
      );
      expect(await birthdayMessages(s.id)).toHaveLength(2);
      // 2028 est bissextile : le 28 ne fête que la cliente du 28, le 29 celle du 29.
      await platform((tx) => queueBirthdayOffers(tx, at("2028-02-28")));
      expect(await birthdayMessages(s.id)).toHaveLength(3);
      await platform((tx) => queueBirthdayOffers(tx, at("2028-02-29")));
      const keys = (await birthdayMessages(s.id)).map((row) => row.dedupeKey);
      expect(keys).toContain(`customer.birthday:${leap.id}:2028`);
      expect(keys).toHaveLength(4);
    });
  });

  describe("code personnel", () => {
    it("utilisable une fois par sa cliente, refusé pour une autre", async () => {
      const s = await setup();
      const camille = await addCustomer(s, { birthMonth: 10, birthDay: 5 });
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY)));
      const [code] = await personalCodes(s.id);
      // Une autre cliente (autre e-mail) : code refusé, rien n'est consommé.
      expect(await errorCode(book(s, { email: "autre@example.com" }, { promoCode: code.code }))).toBe(
        "promo_code_invalid",
      );
      // Sa cliente : 20 % sur le massage.
      const result = await book(s, { email: camille.email! }, { promoCode: code.code.toLowerCase() });
      expect(result).toMatchObject({ totalCents: 5600, discountCents: 1400 });
      // Une seule fois.
      expect(
        await errorCode(
          book(
            s,
            { email: camille.email! },
            { promoCode: code.code, start: localToUtc("2026-10-06", "14:00", TZ) },
          ),
        ),
      ).toBe("promo_code_invalid");
      const [after] = await personalCodes(s.id);
      expect(after.usedCount).toBe(1);
    });
  });

  describe("date d'anniversaire à la réservation", () => {
    const birthdayOf = async (tenantId: string, email: string) => {
      const [row] = await owner
        .select({ month: customers.birthMonth, day: customers.birthDay })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.email, email)));
      return row;
    };

    it("en ligne : ajoutée à une nouvelle fiche ou à une fiche sans date, jamais remplacée", async () => {
      const s = await setup();
      const known = await addCustomer(s, { birthMonth: 3, birthDay: 14 });
      await book(s, { email: known.email!, birthMonth: 6, birthDay: 1 });
      expect(await birthdayOf(s.id, known.email!)).toEqual({ month: 3, day: 14 });

      const undated = await addCustomer(s, { birthMonth: null, birthDay: null });
      await book(
        s,
        { email: undated.email!, birthMonth: 6, birthDay: 1 },
        { start: at("2026-10-06", "12:00") },
      );
      expect(await birthdayOf(s.id, undated.email!)).toEqual({ month: 6, day: 1 });

      await book(
        s,
        { email: "nouvelle@example.com", birthMonth: 2, birthDay: 29 },
        { start: at("2026-10-06", "14:00") },
      );
      expect(await birthdayOf(s.id, "nouvelle@example.com")).toEqual({ month: 2, day: 29 });

      // Rendez-vous noté par la gérante : la date peut être changée.
      await book(
        s,
        { email: known.email!, birthMonth: 6, birthDay: 1 },
        { start: at("2026-10-06", "15:00") },
        "manual",
      );
      expect(await birthdayOf(s.id, known.email!)).toEqual({ month: 6, day: 1 });

      // Date qui n'existe pas : refusée.
      expect(
        await errorCode(
          book(
            s,
            { email: "fausse@example.com", birthMonth: 2, birthDay: 30 },
            { start: at("2026-10-06", "16:00") },
          ),
        ),
      ).toBe("invalid");
    });

    it("sans l'offre, la date est quand même gardée ; la gérante peut la fixer ou la changer", async () => {
      const s = await setup({ offer: false });
      await book(s, { email: "sans@example.com", birthMonth: 6, birthDay: 1 });
      expect(await birthdayOf(s.id, "sans@example.com")).toEqual({ month: 6, day: 1 });
      const [row] = await owner.select().from(customers).where(eq(customers.email, "sans@example.com"));
      await asTenant(s.id, (tx) =>
        saveCustomer(
          tx,
          s.id,
          { firstName: "Camille", email: row.email!, birthMonth: "3", birthDay: "14" },
          row.id,
        ),
      );
      expect(await birthdayOf(s.id, "sans@example.com")).toEqual({ month: 3, day: 14 });
      // Champs absents (autre écran) : la date reste ; champs vides : effacée.
      await asTenant(s.id, (tx) => saveCustomer(tx, s.id, { firstName: "Cam", email: row.email! }, row.id));
      expect(await birthdayOf(s.id, "sans@example.com")).toEqual({ month: 3, day: 14 });
      await asTenant(s.id, (tx) =>
        saveCustomer(tx, s.id, { firstName: "Cam", email: row.email!, birthMonth: "", birthDay: "" }, row.id),
      );
      expect(await birthdayOf(s.id, "sans@example.com")).toEqual({ month: null, day: null });
      // La base refuse une date qui n'existe pas.
      await expect(
        owner.update(customers).set({ birthMonth: 4, birthDay: 31 }).where(eq(customers.id, row.id)),
      ).rejects.toThrow();
    });
  });

  describe("date d'anniversaire au rendez-vous ajouté par la gérante", () => {
    const manual = (s: Setup, birthMonth: number | null, birthDay: number | null, hour = "10:00") =>
      asTenant(s.id, (tx) =>
        createManualAppointment(tx, s.id, {
          serviceIds: [s.massage.id],
          staffId: s.lea.id,
          start: localToUtc("2026-10-06", hour, TZ),
          newCustomer: { firstName: "Inès", phone: "06 11 22 33 44", birthMonth, birthDay },
        }),
      );

    it("enregistrée sur la nouvelle fiche ; une date impossible est refusée", async () => {
      const s = await setup();
      await manual(s, 3, 14);
      const [row] = await owner.select().from(customers).where(eq(customers.tenantId, s.id));
      expect([row.birthMonth, row.birthDay]).toEqual([3, 14]);
      expect(await errorCode(manual(s, 2, 31, "12:00"))).toBe("invalid");
      expect(await errorCode(manual(s, 2, null, "12:00"))).toBe("invalid");
    });
  });

  describe("e-mail", () => {
    const plain = (text: string) => text.replace(/[  ]/g, " ");

    async function dispatch(tenantId: string, now: Date) {
      const rows = await owner
        .select({ id: messageLog.id })
        .from(messageLog)
        .where(and(eq(messageLog.tenantId, tenantId), eq(messageLog.status, "queued")));
      return dispatchMessages(platform, fake.senders, {
        productName: "Horaneo",
        appUrl: "http://localhost:3000",
        now,
        ids: rows.map((row) => row.id),
      });
    }

    it("au nom de l'établissement, avec la réduction, le code et le lien de réservation", async () => {
      const s = await setup();
      const camille = await addCustomer(s, { firstName: "Camille", birthMonth: 10, birthDay: 5 });
      await owner
        .update(businessSettings)
        .set({ birthdayDiscountPercent: 25, birthdayOfferDays: 10 })
        .where(eq(businessSettings.businessId, s.businessId));
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY)));
      const [code] = await personalCodes(s.id);
      expect(await dispatch(s.id, at(TODAY))).toMatchObject({ sent: 1 });
      const email = fake.emails.find((item) => item.to.includes(camille.email!))!;
      expect(email.fromName).toBe(s.name);
      expect(plain(email.subject)).toBe("Joyeux anniversaire Camille !");
      const text = plain(email.text);
      expect(text).toContain(`Toute l'équipe de ${s.name} vous souhaite`);
      expect(text).toContain("25 % de réduction");
      expect(text).toContain(code.code);
      expect(email.html).toContain(code.code);
      expect(text).toContain("Valable jusqu'au 15 octobre 2026");
      expect(text).toContain(`http://${s.slug}.localhost:3000/reserver`);
      expect(text).not.toContain("?avec=");
      // Aucun SMS.
      expect(fake.sms).toHaveLength(0);
    });

    it("site à plusieurs entreprises : au nom de l'entreprise, réservation chez elle", async () => {
      const s = await setup();
      const { business: second } = await platform((tx) =>
        createBusiness(tx, s.id, { name: "Natacha", siret: "987 654 321 00019" }),
      );
      await owner
        .update(businessSettings)
        .set({ birthdayOfferEnabled: true })
        .where(eq(businessSettings.businessId, second.id));
      const [nina] = await owner
        .insert(customers)
        .values({
          tenantId: s.id,
          businessId: second.id,
          firstName: "Nina",
          email: `nina-${n}@example.com`,
          birthMonth: 10,
          birthDay: 5,
        })
        .returning();
      await platform((tx) => queueBirthdayOffers(tx, at(TODAY)));
      const [code] = (await personalCodes(s.id)).filter((row) => row.businessId === second.id);
      expect(code.customerId).toBe(nina.id);
      await dispatch(s.id, at(TODAY));
      const email = fake.emails.find((item) => item.to.includes(nina.email!))!;
      const text = plain(email.text);
      expect(text).toContain("Toute l'équipe de Natacha vous souhaite");
      expect(text).toContain(`/reserver?avec=${second.id}`);
    });
  });
});
