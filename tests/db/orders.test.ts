import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@/db/access";
import type { Transaction } from "@/db/client";
import { messageLog, orders, plans, subscriptions, tenants, users } from "@/db/schema";
import { handleBillingEvent } from "@/modules/billing/events";
import { AppError } from "@/modules/errors";
import { dispatchMessages } from "@/modules/messages/dispatch";
import {
  completeOrdersOfTenant,
  createOrder,
  linkOrderToTenant,
  listPendingOrders,
  rejectOrder,
  syncOrderPayment,
} from "@/modules/orders/orders";
import { salesOpen } from "@/modules/legal/documents";
import { requestCallback } from "@/modules/orders/callback";
import { createTenant } from "@/modules/tenants/create";
import { createFakeBilling } from "../setup/fake-billing";
import { createFakeSenders } from "../setup/fake-senders";
import { openSales } from "../setup/fixtures";
import { hasTestDatabase, openAppDb, openTestDb, type TestDb } from "../setup/db";

/** Commandes du site commercial : demande Basic, paiement d'un pack, création du site, refus. */
const START = new Date("2026-10-05T08:00:00Z");
const urls = (orderId: string) => ({
  successUrl: `https://app.test/commander/merci?commande=${orderId}`,
  cancelUrl: "https://app.test/commander",
});

describe.skipIf(!hasTestDatabase)("commandes", () => {
  let owner: TestDb;
  let app: TestDb;
  let n = 0;
  const billing = createFakeBilling();
  const fake = createFakeSenders();

  let closeSales: (() => Promise<unknown>) | undefined;

  beforeAll(async () => {
    owner = await openTestDb();
    app = openAppDb();
    // Pages légales publiées : la commande en ligne des packs payants est ouverte.
    closeSales = await openSales(owner);
    await owner
      .insert(users)
      .values({ email: "admin-commandes@example.com", isPlatformAdmin: true })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await closeSales?.();
    await app?.$client.end();
    await owner?.$client.end();
  });

  const platform = <T>(fn: (tx: Transaction) => Promise<T>) => withPlatform(fn, app);

  async function errorCode(promise: Promise<unknown>) {
    try {
      await promise;
      return undefined;
    } catch (error) {
      if (error instanceof AppError) return error.code;
      throw error;
    }
  }

  async function newUser() {
    n += 1;
    const [user] = await owner
      .insert(users)
      .values({ email: `pro-${n}-${Date.now().toString(36)}@example.com` })
      .returning();
    return user;
  }

  const form = (planCode: string) => ({
    planCode,
    businessName: `Institut Lumière ${n}`,
    activity: "Esthéticienne",
    phone: "06 12 34 56 78",
    currentWebsite: "institut-lumiere.fr",
  });

  async function dispatchOrder(orderId: string) {
    const rows = await owner.select().from(messageLog).where(eq(messageLog.status, "queued"));
    const ids = rows
      .filter((row) => (row.data as { orderId?: string }).orderId === orderId)
      .map((row) => row.id);
    return dispatchMessages(platform, fake.senders, {
      productName: "Horaneo",
      appUrl: "https://app.test",
      now: START,
      ids,
    });
  }

  it("demande Basic : enregistrée à valider, l'administratrice et le professionnel sont prévenus", async () => {
    const user = await newUser();
    const result = await platform((tx) => createOrder(tx, user.id, form("basic"), billing.gateway, urls));
    expect(result.kind).toBe("submitted");
    const [order] = await owner.select().from(orders).where(eq(orders.id, result.orderId));
    expect(order).toMatchObject({
      status: "awaiting_review",
      phone: "+33612345678",
      currentWebsite: "https://institut-lumiere.fr",
    });
    expect(await dispatchOrder(order.id)).toMatchObject({ sent: 2 });
    const toAdmin = fake.emails.find((email) => email.to.includes("admin-commandes@example.com"))!;
    expect(toAdmin.subject).toBe(`Nouvelle commande : Institut Lumière ${n} (Basic)`);
    expect(toAdmin.replyTo).toBe(user.email);
    const toPro = fake.emails.find((email) => email.to.includes(user.email))!;
    expect(toPro.text).toContain("nous la validons à la main");
    expect(toPro.text).toMatch(/sous 5 jours ouvrés/);
    // Une seconde commande pendant le traitement est refusée.
    expect(
      await errorCode(platform((tx) => createOrder(tx, user.id, form("essentiel"), billing.gateway, urls))),
    ).toBe("order_in_progress");
  });

  it("pack payant : page de paiement, puis commande payée (événement Stripe ou retour du professionnel)", async () => {
    const user = await newUser();
    const first = await platform((tx) => createOrder(tx, user.id, form("essentiel"), billing.gateway, urls));
    expect(first.kind).toBe("redirect");
    // Il revient en arrière et change de pack : la même commande est reprise.
    const again = await platform((tx) => createOrder(tx, user.id, form("serenite"), billing.gateway, urls));
    expect(again.orderId).toBe(first.orderId);
    const [order] = await owner.select().from(orders).where(eq(orders.id, again.orderId));
    const [serenite] = await owner.select().from(plans).where(eq(plans.code, "serenite"));
    expect(order).toMatchObject({ status: "awaiting_payment", planId: serenite.id });
    expect(billing.checkouts.get(order.stripeCheckoutSessionId!)?.metadata).toEqual({
      order_id: order.id,
      plan_id: serenite.id,
      commitment: "yes",
    });

    const subscription = billing.completeCheckout(order.stripeCheckoutSessionId!, START);
    // Retour sur la page de confirmation avant l'événement : l'état est relu chez Stripe.
    const synced = await platform((tx) => syncOrderPayment(tx, user.id, order.id, billing.gateway));
    expect(synced?.status).toBe("paid");
    // L'événement arrive ensuite : sans effet de plus.
    const event = {
      id: `evt_order_${n}`,
      type: "checkout.session.completed",
      raw: {},
      kind: "checkout_completed" as const,
      subscriptionId: subscription.id,
    };
    expect(await platform((tx) => handleBillingEvent(tx, event, billing.gateway))).toMatchObject({
      detail: "already_paid",
    });
    const [paid] = await owner.select().from(orders).where(eq(orders.id, order.id));
    expect(paid).toMatchObject({ status: "paid", stripeSubscriptionId: subscription.id });
    expect((await platform((tx) => listPendingOrders(tx))).map((row) => row.order.id)).toContain(order.id);
    // Un autre utilisateur ne peut pas consulter cette commande.
    const stranger = await newUser();
    expect(await platform((tx) => syncOrderPayment(tx, stranger.id, order.id, billing.gateway))).toBeNull();
  });

  it("création du site depuis la commande : abonnement rattaché, puis activation et message « site en ligne »", async () => {
    const user = await newUser();
    const created = await platform((tx) =>
      createOrder(tx, user.id, form("essentiel"), billing.gateway, urls),
    );
    const [order] = await owner.select().from(orders).where(eq(orders.id, created.orderId));
    const subscription = billing.completeCheckout(order.stripeCheckoutSessionId!, START);
    await platform((tx) =>
      handleBillingEvent(
        tx,
        {
          id: `evt_link_${n}`,
          type: "checkout.session.completed",
          raw: {},
          kind: "checkout_completed",
          subscriptionId: subscription.id,
        },
        billing.gateway,
      ),
    );
    const { tenant } = await platform((tx) =>
      createTenant(tx, {
        name: order.businessName,
        slug: `lumiere-${n}-${Date.now().toString(36)}`,
        planCode: "essentiel",
        managerEmail: user.email,
      }),
    );
    await platform((tx) => linkOrderToTenant(tx, order.id, tenant.id, billing.gateway));
    const [row] = await owner.select().from(subscriptions).where(eq(subscriptions.tenantId, tenant.id));
    expect(row).toMatchObject({ status: "active", stripeSubscriptionId: subscription.id });
    expect(row.commitmentEndsAt?.toISOString()).toBe("2027-10-05T08:00:00.000Z");
    expect((await owner.select().from(orders).where(eq(orders.id, order.id)))[0].status).toBe("in_creation");
    // Déjà rattachée : impossible de créer un second site avec la même commande.
    expect(
      await errorCode(platform((tx) => linkOrderToTenant(tx, order.id, tenant.id, billing.gateway))),
    ).toBe("order_not_pending");

    await owner.update(tenants).set({ status: "active" }).where(eq(tenants.id, tenant.id));
    expect(await platform((tx) => completeOrdersOfTenant(tx, tenant.id))).toBe(1);
    const [live] = await owner
      .select()
      .from(messageLog)
      .where(and(eq(messageLog.tenantId, tenant.id), eq(messageLog.templateKey, "account.site_live")));
    expect(live).toBeDefined();
    await dispatchOrder(order.id);
    expect(
      fake.emails.find(
        (email) => email.to.includes(user.email) && email.subject === "Votre site est en ligne !",
      ),
    ).toBeDefined();
    // Désormais cliente : une nouvelle commande renvoie vers son espace.
    expect(
      await errorCode(platform((tx) => createOrder(tx, user.id, form("serenite"), billing.gateway, urls))),
    ).toBe("already_customer");
  });

  it("refus d'une commande payée : abonnement arrêté, professionnel prévenu", async () => {
    const user = await newUser();
    const created = await platform((tx) =>
      createOrder(tx, user.id, form("essentiel"), billing.gateway, urls),
    );
    const [order] = await owner.select().from(orders).where(eq(orders.id, created.orderId));
    const subscription = billing.completeCheckout(order.stripeCheckoutSessionId!, START);
    await platform((tx) => syncOrderPayment(tx, user.id, order.id, billing.gateway));
    const result = await platform((tx) => rejectOrder(tx, order.id, "Activité hors cible", billing.gateway));
    expect(result.refundNeeded).toBe(true);
    expect(billing.subscriptions.get(subscription.id)?.status).toBe("canceled");
    await dispatchOrder(order.id);
    const mail = fake.emails.find(
      (email) => email.to.includes(user.email) && email.subject.startsWith("Votre demande"),
    )!;
    expect(mail.text).toContain("Motif : Activité hors cible");
    expect(mail.text).toContain("remboursé intégralement");
  });

  it("sans Stripe configuré, un pack payant ne peut pas être commandé", async () => {
    const user = await newUser();
    expect(await errorCode(platform((tx) => createOrder(tx, user.id, form("essentiel"), null, urls)))).toBe(
      "payments_unavailable",
    );
  });

  it("pages légales pas encore publiées : packs payants fermés, Basic ouvert, demande de rappel", async () => {
    await closeSales?.();
    closeSales = undefined;
    try {
      expect(await platform((tx) => salesOpen(tx))).toBe(false);
      const user = await newUser();
      expect(
        await errorCode(platform((tx) => createOrder(tx, user.id, form("essentiel"), billing.gateway, urls))),
      ).toBe("sales_paused");
      const basic = await platform((tx) => createOrder(tx, user.id, form("basic"), billing.gateway, urls));
      expect(basic.kind).toBe("submitted");

      await platform((tx) =>
        requestCallback(tx, {
          name: "Nora Benali",
          businessName: "Institut Nora",
          phone: "06 12 34 56 78",
          planCode: "signature",
          message: "Plutôt le matin",
        }),
      );
      const [row] = await owner
        .select()
        .from(messageLog)
        .where(eq(messageLog.templateKey, "admin.callback_request"))
        .orderBy(desc(messageLog.createdAt))
        .limit(1);
      expect(row.data).toMatchObject({ name: "Nora Benali", phone: "+33612345678", planCode: "signature" });
      await dispatchMessages(platform, fake.senders, {
        productName: "Horaneo",
        appUrl: "https://app.test",
        now: START,
        ids: [row.id],
      });
      const mail = fake.emails.find(
        (email) => email.to.includes("admin-commandes@example.com") && email.text.includes("Nora Benali"),
      )!;
      expect(mail.text).toContain("Signature");
      expect(mail.text).toContain("Plutôt le matin");
      // Numéro invalide : refusé.
      await expect(
        platform((tx) => requestCallback(tx, { name: "Nora", phone: "12 34 56" })),
      ).rejects.toMatchObject({ code: "phone_invalid" });
    } finally {
      closeSales = await openSales(owner);
    }
  });
});
