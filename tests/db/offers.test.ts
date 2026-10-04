import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform, withTenant } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  businessSettings,
  businesses,
  giftCards,
  giftCardTransactions,
  googleReviews,
  messageLog,
  servicePriceHistory,
  services,
} from "@/db/schema";
import { loadBookingContext } from "@/modules/booking/availability";
import { createBooking } from "@/modules/booking/create";
import { cancelByCustomer } from "@/modules/booking/manage";
import { localToUtc, utcToLocal } from "@/modules/booking/time";
import { createBusiness } from "@/modules/businesses/businesses";
import { saveService } from "@/modules/catalog/services";
import { AppError } from "@/modules/errors";
import {
  findGiftCard,
  giftCardCodeFor,
  redeemOnSite,
  startGiftCardPurchase,
  syncGiftCardPayment,
} from "@/modules/giftcards/giftcards";
import { renderMessage } from "@/modules/messages/render";
import { refreshAccount, startOnboarding } from "@/modules/payments/connect";
import { handleEvent } from "@/modules/payments/webhooks";
import { savePromoCode } from "@/modules/promo/codes";
import { savePromotion } from "@/modules/promotions/promotions";
import { refreshGoogleReviews, type ReviewsProvider } from "@/modules/reviews/google";
import { replaceOpeningHours } from "@/modules/schedule/opening-hours";
import { loadSiteData } from "@/modules/site/data";
import { saveStaff } from "@/modules/team/staff";
import { createTenant } from "@/modules/tenants/create";
import { changeStatus } from "@/modules/tenants/update";
import { createFakeGateway } from "../setup/fake-gateway";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/**
 * Étape 9 bis : promotions datées (prix barré honnête), cartes cadeaux (achat,
 * utilisation en ligne et sur place, recrédit), avis Google mis en cache.
 */
const TZ = "Europe/Paris";
const NOW = localToUtc("2026-10-05", "09:00", TZ);
const at = (time: string) => localToUtc("2026-10-06", time, TZ);
const day = (offset: number) => utcToLocal(new Date(Date.now() + offset * 86_400_000), TZ).date;

describe.skipIf(!hasTestDatabase)("promotions, cartes cadeaux et avis Google", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const fake = createFakeGateway();

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
  });

  afterAll(async () => {
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>, businessId?: string) =>
    withPlatform(fn, app, businessId);
  const asTenant = <T>(tenantId: string, fn: (tx: Transaction) => Promise<T>, businessId?: string | null) =>
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

  /** Institut Sérénité ouvert le mardi : massage 70 €, acompte 30 %, Stripe prêt, cartes cadeaux proposées. */
  async function setup({ planCode = "serenite" } = {}) {
    n += 1;
    const slug = `offers-${n}-${Date.now().toString(36)}`;
    const { tenant, business } = await platform((tx) =>
      createTenant(tx, { name: `Institut Offres ${n}`, slug, planCode, managerEmail: `${slug}@example.com` }),
    );
    const id = tenant.id;
    await platform((tx) =>
      replaceOpeningHours(tx, id, [{ weekday: 2, opensAt: "09:00", closesAt: "18:00" }]),
    );
    const massage = await platform((tx) =>
      saveService(tx, id, { name: "Massage", durationMinutes: 60, price: "70" }),
    );
    await platform((tx) => saveStaff(tx, id, { name: "Léa", serviceIds: [massage.id] }));
    await platform((tx) => changeStatus(tx, id, "activate"));
    await owner
      .update(businessSettings)
      .set({ depositEnabled: true, depositType: "percent", depositValue: 30, giftCardsEnabled: true })
      .where(eq(businessSettings.businessId, business.id));
    if (planCode !== "basic") {
      const started = await platform((tx) =>
        startOnboarding(tx, id, business.id, fake.gateway, {
          returnUrl: "https://x",
          refreshUrl: "https://x",
        }),
      );
      fake.activate(started.accountId);
      await platform((tx) => refreshAccount(tx, id, business.id, fake.gateway));
    }
    return { id, businessId: business.id, massage };
  }

  async function buyCard(s: { id: string }, amount = "50", extra: Record<string, string> = {}) {
    const checkout = await asTenant(s.id, (tx) =>
      startGiftCardPurchase(
        tx,
        s.id,
        {
          amount,
          purchaserName: "Camille",
          purchaserEmail: "camille@example.com",
          recipientName: "Inès",
          recipientEmail: "ines@example.com",
          message: "Joyeux anniversaire",
          ...extra,
        },
        fake.gateway,
        NOW,
      ),
    );
    const [card] = await owner.select().from(giftCards).where(eq(giftCards.id, checkout.giftCardId));
    fake.pay(card.stripePaymentIntentId!);
    await asTenant(s.id, (tx) => syncGiftCardPayment(tx, s.id, checkout.giftCardId, fake.gateway));
    return { id: checkout.giftCardId, code: giftCardCodeFor(checkout.giftCardId) };
  }

  function book(
    s: { id: string; massage: { id: string } },
    extra: { giftCardCode?: string; promoCode?: string } = {},
  ) {
    return asTenant(s.id, (tx) =>
      createBooking(
        tx,
        s.id,
        {
          serviceIds: [s.massage.id],
          staffId: null,
          start: at("10:00"),
          customer: {
            firstName: "Camille",
            email: `cliente-${Math.random().toString(36).slice(2, 8)}@example.com`,
            phone: "06 12 34 56 78",
          },
          ...extra,
        },
        { now: NOW, gateway: fake.gateway },
      ),
    );
  }

  async function balanceOf(cardId: string) {
    const [card] = await owner.select().from(giftCards).where(eq(giftCards.id, cardId));
    return card.balanceCents;
  }

  describe("promotions datées", () => {
    it("pendant la période : prix réduit à la réservation, prix barré sur le site, bandeau", async () => {
      const s = await setup();
      await asTenant(s.id, (tx) =>
        savePromotion(tx, s.id, {
          title: "Offre d'automne",
          serviceIds: [s.massage.id],
          discountType: "percent",
          discountValue: "20",
          startsOn: day(-1),
          endsOn: day(10),
        }),
      );
      const context = await asTenant(s.id, (tx) => loadBookingContext(tx, s.id));
      expect(context.services[0]).toMatchObject({ priceCents: 5600, regularPriceCents: 7000 });
      const site = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(site?.services[0].promo).toMatchObject({
        priceCents: 5600,
        referenceCents: 7000,
        title: "Offre d'automne",
      });
      expect(site?.offers).toEqual([expect.objectContaining({ title: "Offre d'automne", endsOn: day(10) })]);

      const result = await book(s);
      expect(result).toMatchObject({ totalCents: 5600, depositCents: 1680 });
      const [item] = await owner
        .select()
        .from(appointmentItems)
        .where(eq(appointmentItems.appointmentId, result.appointmentId));
      expect(item.priceCents).toBe(5600);
    });

    it("pas de cumul avec un code promo", async () => {
      const s = await setup();
      await asTenant(s.id, (tx) =>
        savePromoCode(tx, s.id, { code: "BIENVENUE", discountType: "percent", discountValue: "10" }),
      );
      await asTenant(s.id, (tx) =>
        savePromotion(tx, s.id, {
          title: "Offre",
          serviceIds: [s.massage.id],
          discountType: "fixed",
          discountValue: "10",
          startsOn: day(0),
          endsOn: day(3),
        }),
      );
      expect(await errorCode(book(s, { promoCode: "BIENVENUE" }))).toBe("promo_not_combinable");
    });

    it("ancien prix honnête : une hausse juste avant la promotion ne gonfle pas la réduction", async () => {
      const s = await setup();
      // Il y a 20 jours, le massage coûtait 50 € ; il passe aujourd'hui à 75 €.
      await owner.delete(servicePriceHistory).where(eq(servicePriceHistory.serviceId, s.massage.id));
      await owner.insert(servicePriceHistory).values({
        tenantId: s.id,
        businessId: s.businessId,
        serviceId: s.massage.id,
        priceCents: 5000,
        startsAt: new Date(Date.now() - 20 * 86_400_000),
      });
      await owner.update(services).set({ priceCents: 7500 }).where(eq(services.id, s.massage.id));
      const rows = await owner
        .select()
        .from(servicePriceHistory)
        .where(eq(servicePriceHistory.serviceId, s.massage.id));
      expect(rows.map((row) => row.priceCents).sort()).toEqual([5000, 7500]);
      // « −10 % » donnerait 67,50 € « au lieu de 75 € » : faux, le prix pratiqué était 50 €. La promotion n'est pas affichée.
      await asTenant(s.id, (tx) =>
        savePromotion(tx, s.id, {
          title: "Fausse promo",
          serviceIds: [s.massage.id],
          discountType: "percent",
          discountValue: "10",
          startsOn: day(0),
          endsOn: day(5),
        }),
      );
      const site = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(site?.services[0].promo).toBeNull();
      expect(site?.offers).toEqual([]);
    });

    it("s'arrête seule à la date de fin, et n'existe pas dans le pack Basic", async () => {
      const s = await setup();
      await asTenant(s.id, (tx) =>
        savePromotion(tx, s.id, {
          title: "Terminée",
          serviceIds: [s.massage.id],
          discountType: "percent",
          discountValue: "20",
          startsOn: day(-10),
          endsOn: day(-1),
        }),
      );
      const site = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(site?.services[0].promo).toBeNull();
      const basic = await setup({ planCode: "basic" });
      expect(
        await errorCode(
          asTenant(basic.id, (tx) =>
            savePromotion(tx, basic.id, {
              title: "Non",
              serviceIds: [basic.massage.id],
              discountType: "percent",
              discountValue: "20",
              startsOn: day(0),
              endsOn: day(1),
            }),
          ),
        ),
      ).toBe("feature_unavailable");
    });
  });

  describe("cartes cadeaux", () => {
    it("achat payé sur le compte de l'entreprise, code unique jamais stocké en clair, messages programmés", async () => {
      const s = await setup();
      const card = await buyCard(s, "50", { sendOn: "2026-12-24" });
      const [row] = await owner.select().from(giftCards).where(eq(giftCards.id, card.id));
      expect(row).toMatchObject({
        status: "active",
        initialCents: 5000,
        balanceCents: 5000,
        codeLast4: card.code.slice(-4),
      });
      expect(JSON.stringify(row)).not.toContain(card.code);
      expect(card.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(row.expiresAt.getUTCFullYear()).toBe(2027);
      const intent = fake.intents.get(row.stripePaymentIntentId!);
      expect(intent).toMatchObject({ amountCents: 5000, applicationFeeCents: 0 });
      expect(intent?.metadata.gift_card_id).toBe(card.id);

      const messages = await owner.select().from(messageLog).where(eq(messageLog.tenantId, s.id));
      const scheduled = messages.find((message) => message.templateKey === "customer.gift_card");
      expect(scheduled?.nextAttemptAt?.toISOString()).toBe(
        localToUtc("2026-12-24", "09:00", TZ).toISOString(),
      );
      expect(messages.map((message) => message.templateKey)).toEqual(
        expect.arrayContaining(["customer.gift_card_receipt", "manager.gift_card_sold"]),
      );

      // La carte au destinataire contient le code ; le reçu, seulement sa fin.
      const rendered = await platform(async (tx) => {
        const giftMail = await renderMessage(tx, scheduled!, {
          productName: "Horaneo",
          appUrl: "https://x",
          now: NOW,
        });
        const receipt = messages.find((message) => message.templateKey === "customer.gift_card_receipt")!;
        const receiptMail = await renderMessage(tx, receipt, {
          productName: "Horaneo",
          appUrl: "https://x",
          now: NOW,
        });
        return { giftMail, receiptMail };
      });
      expect(rendered.giftMail).toMatchObject({ kind: "email", to: ["ines@example.com"] });
      expect(rendered.giftMail.kind === "email" && rendered.giftMail.text).toContain(card.code);
      expect(rendered.receiptMail).toMatchObject({ kind: "email", to: ["camille@example.com"] });
      expect(rendered.receiptMail.kind === "email" && rendered.receiptMail.text).not.toContain(card.code);
    });

    it("l'événement Stripe active la carte une seule fois", async () => {
      const s = await setup();
      const checkout = await asTenant(s.id, (tx) =>
        startGiftCardPurchase(
          tx,
          s.id,
          { amount: "30", purchaserName: "Camille", purchaserEmail: "camille@example.com" },
          fake.gateway,
          NOW,
        ),
      );
      const [card] = await owner.select().from(giftCards).where(eq(giftCards.id, checkout.giftCardId));
      const intent = fake.pay(card.stripePaymentIntentId!);
      const event = fake.event("payment_intent.succeeded", card.stripeAccountId, {
        id: intent.id,
        status: "succeeded",
        metadata: intent.metadata,
      });
      expect(await platform((tx) => handleEvent(tx, event, fake.gateway))).toMatchObject({
        detail: "activated",
      });
      expect(
        await platform((tx) => handleEvent(tx, { ...event, id: `${event.id}-bis` }, fake.gateway)),
      ).toMatchObject({
        detail: "already_active",
      });
      const purchases = await owner
        .select()
        .from(giftCardTransactions)
        .where(and(eq(giftCardTransactions.giftCardId, card.id), eq(giftCardTransactions.kind, "purchase")));
      expect(purchases).toHaveLength(1);
    });

    it("refuse un montant hors limites, ou quand l'entreprise ne propose pas les cartes", async () => {
      const s = await setup();
      const attempt = (amount: string) =>
        errorCode(
          asTenant(s.id, (tx) =>
            startGiftCardPurchase(
              tx,
              s.id,
              { amount, purchaserName: "Camille", purchaserEmail: "c@example.com" },
              fake.gateway,
              NOW,
            ),
          ),
        );
      expect(await attempt("5")).toBe("gift_card_amount");
      expect(await attempt("900")).toBe("gift_card_amount");
      await owner
        .update(businessSettings)
        .set({ giftCardsEnabled: false })
        .where(eq(businessSettings.businessId, s.businessId));
      expect(await attempt("50")).toBe("gift_cards_unavailable");
    });

    it("en ligne, la carte remplace l'acompte ; annulation dans le délai : montant remis sur la carte", async () => {
      const s = await setup();
      const card = await buyCard(s, "50");
      const result = await book(s, { giftCardCode: card.code.toLowerCase().replaceAll("-", " ") });
      expect(result).toMatchObject({
        status: "confirmed",
        depositCents: 2100,
        payment: null,
        paidWithGiftCard: true,
      });
      expect(await balanceOf(card.id)).toBe(2900);
      await asTenant(s.id, (tx) => cancelByCustomer(tx, s.id, result.manageToken, NOW, fake.gateway));
      expect(await balanceOf(card.id)).toBe(5000);
      const kinds = (
        await owner.select().from(giftCardTransactions).where(eq(giftCardTransactions.giftCardId, card.id))
      ).map((row) => row.kind);
      expect(kinds.sort()).toEqual(["credit_back", "purchase", "redeem_online"]);
    });

    it("solde insuffisant pour l'acompte : la réservation est refusée sans rien débiter", async () => {
      const s = await setup();
      const card = await buyCard(s, "10");
      expect(await errorCode(book(s, { giftCardCode: card.code }))).toBe("gift_card_insufficient");
      expect(await balanceOf(card.id)).toBe(1000);
    });

    it("sur place : la gérante déduit un montant, le solde est conservé ; carte expirée refusée", async () => {
      const s = await setup();
      const card = await buyCard(s, "50");
      const first = await asTenant(s.id, (tx) =>
        redeemOnSite(tx, s.id, { code: card.code, amount: "30" }, null),
      );
      expect(first.balanceCents).toBe(2000);
      expect(
        await errorCode(
          asTenant(s.id, (tx) => redeemOnSite(tx, s.id, { code: card.code, amount: "25" }, null)),
        ),
      ).toBe("gift_card_insufficient");
      await asTenant(s.id, (tx) => redeemOnSite(tx, s.id, { code: card.code, amount: "20" }, null));
      expect(
        await errorCode(
          asTenant(s.id, (tx) => redeemOnSite(tx, s.id, { code: card.code, amount: "1" }, null)),
        ),
      ).toBe("gift_card_used");
      const other = await buyCard(s, "40");
      await owner
        .update(giftCards)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(giftCards.id, other.id));
      expect(
        await errorCode(
          asTenant(s.id, (tx) => redeemOnSite(tx, s.id, { code: other.code, amount: "5" }, null)),
        ),
      ).toBe("gift_card_expired");
      expect(
        await errorCode(
          asTenant(s.id, (tx) => redeemOnSite(tx, s.id, { code: "AAAA-BBBB-CCCC", amount: "5" }, null)),
        ),
      ).toBe("gift_card_not_found");
    });

    it("une carte appartient à l'entreprise qui l'a encaissée : inconnue chez l'autre entreprise du site", async () => {
      const s = await setup();
      const card = await buyCard(s, "50");
      const { business: other } = await platform((tx) =>
        createBusiness(tx, s.id, { name: "Inès", managerEmail: `ines-${s.id.slice(0, 8)}@example.com` }),
      );
      expect(await asTenant(s.id, (tx) => findGiftCard(tx, s.id, card.code), other.id)).toBeNull();
      expect(
        await errorCode(
          asTenant(s.id, (tx) => redeemOnSite(tx, s.id, { code: card.code, amount: "5" }, null), other.id),
        ),
      ).toBe("gift_card_not_found");
      // Ni la carte ni ses mouvements ne sont visibles depuis l'autre entreprise, ni depuis la vue « site ».
      for (const businessId of [other.id, null]) {
        const seen = await asTenant(s.id, (tx) => tx.select().from(giftCards), businessId);
        expect(seen).toHaveLength(0);
      }
    });
  });

  describe("avis Google", () => {
    const place = {
      rating: 4.9,
      total: 88,
      url: "https://maps.google.com/?cid=1",
      reviews: [
        {
          author: "Sophie",
          authorUrl: null,
          authorPhotoUrl: null,
          rating: 5,
          text: "Sourire, gentillesse et professionnalisme.",
          relativeTime: "il y a 2 semaines",
          publishedAt: null,
        },
      ],
    };

    it("relit une fois par jour, garde la dernière copie si Google ne répond pas", async () => {
      const s = await setup();
      await owner
        .update(businesses)
        .set({ googlePlaceId: `ChIJ-test-${s.id.slice(0, 8)}` })
        .where(eq(businesses.id, s.businessId));
      let calls = 0;
      let failing = false;
      const provider: ReviewsProvider = {
        async fetchPlace() {
          calls += 1;
          if (failing) throw new Error("Google indisponible");
          return place;
        },
      };
      await platform((tx) => refreshGoogleReviews(tx, provider));
      const site = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(site?.reviews[0]).toMatchObject({ rating: 4.9, total: 88, url: place.url });
      expect(site?.reviews[0].reviews[0].text).toBe(place.reviews[0].text);

      // Moins de 24 h plus tard : pas de nouvel appel.
      const before = calls;
      await platform((tx) => refreshGoogleReviews(tx, provider));
      expect(calls).toBe(before);

      // Le lendemain, Google ne répond pas : la copie reste affichée, l'erreur est notée.
      failing = true;
      await platform((tx) => refreshGoogleReviews(tx, provider, new Date(Date.now() + 25 * 3_600_000)));
      const [cache] = await owner
        .select()
        .from(googleReviews)
        .where(eq(googleReviews.businessId, s.businessId));
      expect(cache.lastError).toContain("indisponible");
      const still = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(still?.reviews[0].rating).toBe(4.9);

      // Copie de plus de 30 jours : plus affichée, seul le lien vers les avis reste.
      await owner
        .update(googleReviews)
        .set({ fetchedAt: new Date(Date.now() - 31 * 86_400_000) })
        .where(eq(googleReviews.businessId, s.businessId));
      const stale = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(stale?.reviews[0]).toMatchObject({ rating: null, reviews: [] });
      expect(stale?.reviews[0].url).toContain("ChIJ-test");
    });

    it("pack sans avis Google : aucun appel, rien d'affiché", async () => {
      const s = await setup({ planCode: "essentiel" });
      await owner
        .update(businesses)
        .set({ googlePlaceId: `ChIJ-ess-${s.id.slice(0, 8)}` })
        .where(eq(businesses.id, s.businessId));
      const provider: ReviewsProvider = {
        async fetchPlace() {
          throw new Error("ne doit pas être appelé");
        },
      };
      await platform((tx) => refreshGoogleReviews(tx, provider));
      const [cache] = await owner
        .select()
        .from(googleReviews)
        .where(eq(googleReviews.businessId, s.businessId));
      expect(cache).toBeUndefined();
      const site = await asTenant(s.id, (tx) => loadSiteData(tx, s.id), null);
      expect(site?.reviews).toEqual([]);
    });
  });
});
