import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  customerLoginCodes,
  customers,
  giftCards,
  loyaltyEvents,
  loyaltyRewards,
  messageLog,
} from "@/db/schema";
import { setAttendance } from "@/modules/agenda/actions";
import { createBooking } from "@/modules/booking/create";
import { localToUtc } from "@/modules/booking/time";
import { createBusiness } from "@/modules/businesses/businesses";
import { saveService } from "@/modules/catalog/services";
import {
  issueLoginCode,
  knownBusinesses,
  loginSecretFor,
  parseIdentifier,
  readSession,
  signInWithCode,
  signInWithLink,
} from "@/modules/customer-space/auth";
import { loadBusinessSpace, requestDataAction } from "@/modules/customer-space/space";
import { AppError } from "@/modules/errors";
import {
  adjustLoyalty,
  customerLoyalty,
  loyaltyForManager,
  setLoyaltySettings,
  redeemReward,
} from "@/modules/loyalty/loyalty";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changePlan, changeStatus } from "@/modules/tenants/update";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Espace des clientes : connexion sans mot de passe, rendez-vous de la seule
 * cliente connectée, fidélité (un point par rendez-vous honoré) et séparation
 * des données entre les entreprises d'un même site.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const at = (date: string, time: string) => localToUtc(date, time, TZ);

describe.skipIf(!hasTestDatabase)("espace des clientes", () => {
  let owner: TestDb;
  let app: TestDb;
  let tenantId = "";
  let laila = { id: "", serviceId: "" };
  let natacha = { id: "", serviceId: "" };

  const platform = <T>(fn: (tx: Transaction) => Promise<T>, businessId?: string) =>
    withPlatform(fn, app, businessId);
  const asBusiness = <T>(businessId: string | null | undefined, fn: (tx: Transaction) => Promise<T>) =>
    withTenant(tenantId, fn, app, businessId);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  function book(businessId: string, serviceId: string, email: string, date: string, time: string) {
    return asBusiness(businessId, (tx) =>
      createBooking(
        tx,
        tenantId,
        {
          serviceIds: [serviceId],
          staffId: null,
          start: at(date, time),
          customer: { firstName: email.split("@")[0], email, phone: "06 12 34 56 78" },
        },
        { now: NOW },
      ),
    );
  }

  async function customerOf(appointmentId: string) {
    const [row] = await owner.select().from(appointments).where(eq(appointments.id, appointmentId));
    return row.customerId;
  }

  const camille = { channel: "email" as const, identifier: "camille@example.com" };

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    const slug = `espace-${Date.now().toString(36)}`;
    const created = await platform((tx) =>
      createTenant(tx, {
        name: "Institut Espace",
        slug,
        planCode: "serenite",
        managerEmail: `l-${slug}@example.com`,
      }),
    );
    tenantId = created.tenant.id;
    const second = await platform((tx) =>
      createBusiness(tx, tenantId, { name: "Natacha", managerEmail: `n-${slug}@example.com` }),
    );
    const fill = async (businessId: string, name: string) => {
      await platform(
        (tx) =>
          replaceOpeningHours(tx, tenantId, [
            { weekday: 1, opensAt: "09:00", closesAt: "19:00" },
            { weekday: 2, opensAt: "09:00", closesAt: "19:00" },
          ]),
        businessId,
      );
      const service = await platform(
        (tx) => saveService(tx, tenantId, { name, durationMinutes: 60, price: "60" }),
        businessId,
      );
      await platform((tx) => saveStaff(tx, tenantId, { name, serviceIds: [service.id] }), businessId);
      return { id: businessId, serviceId: service.id };
    };
    laila = await fill(created.business.id, "Réhaussement");
    natacha = await fill(second.business.id, "Massage");
    await platform((tx) => changeStatus(tx, tenantId, "activate"));
    for (const business of [laila, natacha]) {
      await asBusiness(business.id, (tx) =>
        setLoyaltySettings(tx, tenantId, {
          enabled: true,
          visitsRequired: 2,
          rewardLabel: "Un soin offert",
          validityDays: 90,
        }),
      );
    }
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  describe("connexion sans mot de passe", () => {
    it("reconnaît un e-mail ou un téléphone", () => {
      expect(parseIdentifier(" Camille@Example.com ", "FR")).toEqual(camille);
      expect(parseIdentifier("06 12 34 56 78", "FR")).toEqual({ channel: "sms", identifier: "+33612345678" });
    });

    it("ne connaît pas une adresse sans fiche ni carte : rien n'est envoyé", async () => {
      expect(await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, camille))).toEqual([]);
    });

    it("le lien sert une seule fois et ouvre une session", async () => {
      await book(laila.id, laila.serviceId, "camille@example.com", "2026-10-06", "10:00");
      const businesses = await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, camille));
      expect(businesses).toEqual([laila.id]);
      const issued = await asBusiness(laila.id, (tx) =>
        issueLoginCode(tx, tenantId, camille, { businessId: laila.id, locale: "fr", now: NOW }),
      );
      expect(issued.issued).toBe(true);
      const token = loginSecretFor(issued.issued ? issued.id : "", "email");
      const session = await asBusiness(null, (tx) => signInWithLink(tx, tenantId, token, NOW));
      expect(await asBusiness(null, (tx) => readSession(tx, tenantId, session, NOW))).toMatchObject(camille);
      expect(await errorCode(asBusiness(null, (tx) => signInWithLink(tx, tenantId, token, NOW)))).toBe(
        "login_invalid",
      );
      // Le message ne contient que l'identifiant de la demande, jamais le lien.
      const [message] = await owner
        .select()
        .from(messageLog)
        .where(eq(messageLog.dedupeKey, `customer.login:${issued.issued ? issued.id : ""}`));
      expect(JSON.stringify(message.data)).not.toContain(token);
    });

    it("un lien expiré est refusé", async () => {
      const issued = await asBusiness(laila.id, (tx) =>
        issueLoginCode(tx, tenantId, camille, { businessId: laila.id, locale: "fr", now: NOW }),
      );
      const token = loginSecretFor(issued.issued ? issued.id : "", "email");
      const later = new Date(NOW.getTime() + 16 * 60_000);
      expect(await errorCode(asBusiness(null, (tx) => signInWithLink(tx, tenantId, token, later)))).toBe(
        "login_invalid",
      );
    });

    it("un nouveau lien rend l'ancien inutilisable", async () => {
      const first = await asBusiness(laila.id, (tx) =>
        issueLoginCode(tx, tenantId, camille, { businessId: laila.id, locale: "fr", now: NOW }),
      );
      await asBusiness(laila.id, (tx) =>
        issueLoginCode(tx, tenantId, camille, { businessId: laila.id, locale: "fr", now: NOW }),
      );
      const token = loginSecretFor(first.issued ? first.id : "", "email");
      expect(await errorCode(asBusiness(null, (tx) => signInWithLink(tx, tenantId, token, NOW)))).toBe(
        "login_invalid",
      );
    });

    it("limite le nombre de demandes par heure", async () => {
      const results = [];
      for (let i = 0; i < 3; i += 1)
        results.push(
          await asBusiness(laila.id, (tx) =>
            issueLoginCode(tx, tenantId, camille, { businessId: laila.id, locale: "fr", now: NOW }),
          ),
        );
      expect(results.at(-1)?.issued).toBe(false);
    });

    it("une réservation en ligne avec l'e-mail d'une autre ne change pas son numéro", async () => {
      // Quelqu'un réserve avec l'e-mail de Camille et son propre numéro…
      const booked = await asBusiness(laila.id, (tx) =>
        createBooking(
          tx,
          tenantId,
          {
            serviceIds: [laila.serviceId],
            staffId: null,
            start: at("2026-10-06", "16:00"),
            customer: { firstName: "Intrus", email: "camille@example.com", phone: "07 99 99 99 99" },
          },
          { now: NOW },
        ),
      );
      // Fiche de ce site seulement : d'autres fichiers de test, lancés en même temps, ont aussi une Camille.
      const [fiche] = await owner
        .select()
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), eq(customers.email, "camille@example.com")));
      expect(fiche).toMatchObject({ firstName: "camille", phone: "+33612345678", phoneDisputed: true });
      // …et ne peut donc pas se connecter par SMS à l'espace de Camille.
      const intrus = { channel: "sms" as const, identifier: "+33799999999" };
      expect(await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, intrus))).toEqual([]);
      // On ne sait pas quel numéro est le bon : celui de la fiche ne sert plus par SMS non plus,
      // tant que la gérante n'a pas vérifié la fiche (l'e-mail, lui, marche toujours).
      const sms = { channel: "sms" as const, identifier: "+33612345678" };
      expect(await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, sms))).toEqual([]);
      expect(await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, camille))).toContain(laila.id);
      // (Rendez-vous retiré et fiche vérifiée pour ne pas fausser les tests suivants.)
      await owner
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, booked.appointmentId));
      await owner.update(customers).set({ phoneDisputed: false }).where(eq(customers.id, fiche.id));
    });

    it("une fiche créée en ligne avec l'e-mail d'une autre ne donne pas accès à ses rendez-vous par SMS", async () => {
      const email = "future.cliente@example.com";
      const reserve = (phone: string, time: string) =>
        asBusiness(laila.id, (tx) =>
          createBooking(
            tx,
            tenantId,
            {
              serviceIds: [laila.serviceId],
              staffId: null,
              start: at("2026-10-06", time),
              customer: { firstName: "Cliente", email, phone },
            },
            { now: NOW },
          ),
        );
      // Une inconnue réserve la première avec l'e-mail de la future cliente et son propre numéro…
      const first = await reserve("07 88 88 88 88", "17:00");
      const intrus = { channel: "sms" as const, identifier: "+33788888888" };
      expect(await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, intrus))).toEqual([laila.id]);
      // …puis la vraie cliente réserve avec son numéro : la fiche est la même, le numéro diffère.
      const second = await reserve("06 55 55 55 55", "18:00");
      expect(await asBusiness(null, (tx) => knownBusinesses(tx, tenantId, intrus))).toEqual([]);
      await owner
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, first.appointmentId));
      await owner
        .update(appointments)
        .set({ status: "cancelled" })
        .where(eq(appointments.id, second.appointmentId));
    });

    it("la recherche d'une cliente reste limitée au site déclaré", async () => {
      expect(
        await withTenant(randomUUID(), (tx) => knownBusinesses(tx, tenantId, camille), app, null),
      ).toEqual([]);
    });

    it("pas plus de 3 codes SMS par jour pour un même numéro (quota de SMS protégé)", async () => {
      const phone = { channel: "sms" as const, identifier: "+33611111111" };
      const issue = (hoursLater: number) =>
        asBusiness(laila.id, (tx) =>
          issueLoginCode(tx, tenantId, phone, {
            businessId: laila.id,
            locale: "fr",
            now: new Date(NOW.getTime() + hoursLater * 3_600_000),
          }),
        );
      const results = [await issue(0), await issue(2), await issue(4), await issue(6)];
      expect(results.map((result) => result.issued)).toEqual([true, true, true, false]);
      expect((await issue(25)).issued).toBe(true);
    });

    it("le code SMS est refusé après 5 erreurs, même juste ensuite", async () => {
      const phone = { channel: "sms" as const, identifier: "+33612345678" };
      const issued = await asBusiness(laila.id, (tx) =>
        issueLoginCode(tx, tenantId, phone, { businessId: laila.id, locale: "fr", now: NOW }),
      );
      const code = loginSecretFor(issued.issued ? issued.id : "", "sms");
      const wrong = code === "000000" ? "111111" : "000000";
      // Un code faux ne connecte pas (null) mais l'essai est bien compté.
      for (let i = 0; i < 5; i += 1)
        expect(
          await asBusiness(null, (tx) => signInWithCode(tx, tenantId, phone.identifier, wrong, NOW)),
        ).toBeNull();
      expect(
        await asBusiness(null, (tx) => signInWithCode(tx, tenantId, phone.identifier, code, NOW)),
      ).toBeNull();
      // Numéro inconnu : même réponse qu'un code faux (rien ne révèle s'il est connu).
      expect(
        await asBusiness(null, (tx) => signInWithCode(tx, tenantId, "+33699999999", code, NOW)),
      ).toBeNull();
      const [row] = await owner
        .select()
        .from(customerLoginCodes)
        .where(eq(customerLoginCodes.id, issued.issued ? issued.id : ""));
      expect(row.failedAttempts).toBe(5);
    });
  });

  describe("contenu de l'espace", () => {
    it("une cliente ne voit que ses propres rendez-vous", async () => {
      await book(laila.id, laila.serviceId, "lea@example.com", "2026-10-06", "14:00");
      const space = await asBusiness(laila.id, (tx) =>
        loadBusinessSpace(tx, tenantId, laila.id, camille, { now: NOW, locale: "fr" }),
      );
      expect(space.upcoming).toHaveLength(1);
      expect(space.upcoming[0].services).toEqual(["Réhaussement"]);
      expect(space.upcoming[0].canModify).toBe(true);
      const lea = await asBusiness(laila.id, (tx) =>
        loadBusinessSpace(
          tx,
          tenantId,
          laila.id,
          { channel: "email", identifier: "lea@example.com" },
          {
            now: NOW,
            locale: "fr",
          },
        ),
      );
      expect(lea.upcoming).toHaveLength(1);
      expect(lea.upcoming[0].id).not.toBe(space.upcoming[0].id);
    });

    it("rattache par téléphone exact : le même numéro retrouve les deux fiches", async () => {
      const space = await asBusiness(laila.id, (tx) =>
        loadBusinessSpace(
          tx,
          tenantId,
          laila.id,
          { channel: "sms", identifier: "+33612345678" },
          {
            now: NOW,
            locale: "fr",
          },
        ),
      );
      expect(space.upcoming).toHaveLength(2);
    });

    it("chez une autre entreprise du site, seules ses données à elle apparaissent", async () => {
      await book(natacha.id, natacha.serviceId, "camille@example.com", "2026-10-06", "11:00");
      const space = await asBusiness(natacha.id, (tx) =>
        loadBusinessSpace(tx, tenantId, natacha.id, camille, { now: NOW, locale: "fr" }),
      );
      expect(space.upcoming.map((item) => item.services[0])).toEqual(["Massage"]);
      // Une entreprise ne peut pas lire l'espace de l'autre, même en le demandant.
      const crossed = await asBusiness(natacha.id, (tx) =>
        loadBusinessSpace(tx, tenantId, laila.id, camille, { now: NOW, locale: "fr" }).catch(() => null),
      );
      expect(crossed?.upcoming ?? []).toEqual([]);
    });

    it("la demande de suppression arrive chez la seule entreprise concernée", async () => {
      await asBusiness(laila.id, (tx) => requestDataAction(tx, tenantId, camille, "deletion"));
      const again = await asBusiness(laila.id, (tx) => requestDataAction(tx, tenantId, camille, "deletion"));
      expect(again.created).toBe(0);
      const lailaSpace = await asBusiness(laila.id, (tx) =>
        loadBusinessSpace(tx, tenantId, laila.id, camille, { now: NOW, locale: "fr" }),
      );
      const natachaSpace = await asBusiness(natacha.id, (tx) =>
        loadBusinessSpace(tx, tenantId, natacha.id, camille, { now: NOW, locale: "fr" }),
      );
      expect(lailaSpace.pendingRequests).toEqual(["deletion"]);
      expect(natachaSpace.pendingRequests).toEqual([]);
    });
  });

  describe("cartes cadeaux", () => {
    it("le code n'est montré qu'à la personne qui reçoit la carte, une fois envoyée", async () => {
      const sendAt = at("2026-10-10", "08:00");
      await owner.insert(giftCards).values({
        tenantId,
        businessId: laila.id,
        codeHash: randomUUID().replace(/-/g, "").padEnd(64, "0"),
        codeLast4: "TEST",
        status: "active",
        initialCents: 5000,
        balanceCents: 5000,
        purchaserName: "Camille",
        purchaserEmail: "camille@example.com",
        recipientName: "Lou",
        recipientEmail: "lou@example.com",
        sendAt,
        expiresAt: at("2027-10-10", "08:00"),
      });
      const lou = { channel: "email" as const, identifier: "lou@example.com" };
      const cardOf = async (identity: typeof lou, now: Date) => {
        const space = await asBusiness(laila.id, (tx) =>
          loadBusinessSpace(tx, tenantId, laila.id, identity, { now, locale: "fr" }),
        );
        return space.giftCards?.find((card) => card.balanceCents === 5000);
      };
      // L'acheteuse voit la carte offerte, jamais son code.
      expect(await cardOf(camille, NOW)).toMatchObject({ code: null, received: false, recipientName: "Lou" });
      expect(await cardOf(camille, sendAt)).toMatchObject({ code: null });
      // La personne qui la reçoit : pas de code avant la date d'envoi, puis le code.
      expect(await cardOf(lou, NOW)).toMatchObject({ code: null, received: true });
      expect((await cardOf(lou, sendAt))?.code).toMatch(/\S+/);
    });
  });

  describe("fidélité", () => {
    it("le compteur n'avance que sur un rendez-vous honoré", async () => {
      const first = await book(laila.id, laila.serviceId, "zoe@example.com", "2026-10-05", "11:30");
      const second = await book(laila.id, laila.serviceId, "zoe@example.com", "2026-10-05", "13:00");
      const customerId = await customerOf(first.appointmentId);
      const points = () => asBusiness(laila.id, (tx) => customerLoyalty(tx, tenantId, [customerId], NOW));
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, second.appointmentId, "no_show"));
      expect((await points())?.points).toBe(0);
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, first.appointmentId, "attended"));
      expect((await points())?.points).toBe(1);
      // Marqué deux fois : un seul point.
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, first.appointmentId, "attended"));
      expect((await points())?.points).toBe(1);
      // Correction : venue → absente, le point est retiré.
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, first.appointmentId, "no_show"));
      expect(await points()).toMatchObject({ points: 0, remaining: 2, reward: null });
      // Nouvelle correction : de nouveau venue, le point revient (une seule fois).
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, first.appointmentId, "attended"));
      expect((await points())?.points).toBe(1);
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, first.appointmentId, "attended"));
      expect((await points())?.points).toBe(1);
    });

    it("le bon apparaît au nombre de visites, et son utilisation garde les points en trop", async () => {
      const visit = await book(laila.id, laila.serviceId, "ines@example.com", "2026-10-05", "15:00");
      const customerId = await customerOf(visit.appointmentId);
      await asBusiness(laila.id, (tx) => setAttendance(tx, tenantId, visit.appointmentId, "attended"));
      await asBusiness(laila.id, (tx) =>
        adjustLoyalty(tx, tenantId, customerId, { points: 2, reason: "Visites avant le site" }, null, NOW),
      );
      const summary = await asBusiness(laila.id, (tx) => customerLoyalty(tx, tenantId, [customerId], NOW));
      expect(summary?.points).toBe(3);
      expect(summary?.reward?.label).toBe("Un soin offert");
      await asBusiness(laila.id, (tx) => redeemReward(tx, tenantId, summary!.reward!.id, null, NOW));
      const after = await asBusiness(laila.id, (tx) => customerLoyalty(tx, tenantId, [customerId], NOW));
      expect(after).toMatchObject({ points: 1, remaining: 1, reward: null });
      expect(
        await errorCode(
          asBusiness(laila.id, (tx) => redeemReward(tx, tenantId, summary!.reward!.id, null, NOW)),
        ),
      ).toBe("reward_unavailable");
    });

    it("après un passage à un pack sans fidélité, le bon déjà gagné reste visible et utilisable", async () => {
      const visit = await book(laila.id, laila.serviceId, "maya@example.com", "2026-10-05", "16:30");
      const customerId = await customerOf(visit.appointmentId);
      await asBusiness(laila.id, (tx) =>
        adjustLoyalty(tx, tenantId, customerId, { points: 2, reason: "Reprise" }, null, NOW),
      );
      await platform((tx) => changePlan(tx, tenantId, "essentiel"));
      try {
        const summary = await asBusiness(laila.id, (tx) => customerLoyalty(tx, tenantId, [customerId], NOW));
        expect(summary).toMatchObject({ active: false, reward: { label: "Un soin offert" } });
        const manager = await asBusiness(laila.id, (tx) => loyaltyForManager(tx, tenantId, customerId, NOW));
        expect(manager?.summary?.reward?.id).toBe(summary!.reward!.id);
        await asBusiness(laila.id, (tx) => redeemReward(tx, tenantId, summary!.reward!.id, null, NOW));
        // Plus de bon, et plus de points qui s'accumulent : rien à afficher.
        expect(
          await asBusiness(laila.id, (tx) => customerLoyalty(tx, tenantId, [customerId], NOW)),
        ).toBeNull();
      } finally {
        await platform((tx) => changePlan(tx, tenantId, "serenite"));
      }
    });

    it("le compteur et les bons restent propres à chaque entreprise", async () => {
      const seenByNatacha = await asBusiness(natacha.id, async (tx) => ({
        events: await tx.select().from(loyaltyEvents),
        rewards: await tx.select().from(loyaltyRewards),
      }));
      expect(seenByNatacha.events).toEqual([]);
      expect(seenByNatacha.rewards).toEqual([]);
      const seenByLaila = await asBusiness(laila.id, (tx) => tx.select().from(loyaltyEvents));
      expect(seenByLaila.length).toBeGreaterThan(0);
      expect(new Set(seenByLaila.map((row) => row.businessId))).toEqual(new Set([laila.id]));
    });
  });
});
