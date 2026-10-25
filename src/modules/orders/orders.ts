import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { creationFeeFor } from "@/modules/billing/plans";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { memberships, orders, plans, subscriptions, users } from "@/db/schema";
import type { BillingGateway } from "@/modules/billing/gateway";
import {
  confirmOrderClaim,
  linkOrderClaimToTenant,
  releaseOrderClaim,
  reserveForOrder,
} from "@/modules/billing/launch-offers";
import { resolveOptions } from "@/modules/billing/option-total";
import { ensureOptionPrice, listPlanOptions, pricedOption } from "@/modules/billing/options";
import { applySubscription, ensurePlanPrice, ensureTaxRate } from "@/modules/billing/subscriptions";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { salesOpen } from "@/modules/legal/documents";
import { normalizePhone } from "@/modules/phone";
import { getPlatformSetting } from "@/modules/settings";

/**
 * Commandes passées sur le site commercial (rôle plateforme).
 * Le site n'est jamais créé automatiquement : la commande alerte l'administratrice,
 * qui construit le site puis active l'accès. Un pack payant est réglé à la commande ;
 * une demande Basic est validée à la main.
 */

export const orderInput = z.object({
  planCode: z.string().min(1).max(40),
  businessName: z.string().trim().min(2).max(120),
  activity: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40),
  currentWebsite: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => (value ? (/^https?:\/\//i.test(value) ? value : `https://${value}`) : undefined))
    .pipe(z.url().optional()),
  locale: z.string().min(2).max(5).default("fr"),
  /** Formule des packs payants : avec engagement (création offerte) ou sans (frais de création). */
  withCommitment: z.boolean().default(true),
  /** Options choisies (codes) ; leurs dépendances sont ajoutées automatiquement. */
  optionCodes: z.array(z.string().max(40)).max(20).default([]),
  /** Facturation : chaque mois, ou à l'année (réduction réglée dans l'admin). */
  billingInterval: z.enum(["month", "year"]).default("month"),
});

export type OrderInput = z.input<typeof orderInput>;

/** Commandes encore en cours (ni terminées, ni refusées, ni abandonnées). */
const OPEN_STATUSES = ["awaiting_payment", "awaiting_review", "paid", "in_creation"] as const;

export type OrderResult =
  { kind: "redirect"; url: string; orderId: string } | { kind: "submitted"; orderId: string };

export async function ordersOfUser(tx: Transaction, userId: string) {
  return tx
    .select({ order: orders, planName: plans.name, planCode: plans.code })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));
}

/** Enregistre une commande ; pour un pack payant, renvoie la page de paiement Stripe. */
export async function createOrder(
  tx: Transaction,
  userId: string,
  raw: OrderInput,
  gateway: BillingGateway | null,
  urls: (orderId: string) => { successUrl: string; cancelUrl: string },
): Promise<OrderResult> {
  const input = orderInput.parse(raw);
  const [user] = await tx.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AppError("not_found");
  const [plan] = await tx.select().from(plans).where(eq(plans.code, input.planCode));
  if (!plan || !plan.isPublic) throw new AppError("invalid", "planCode");
  // Pages légales pas encore publiées : pas de paiement en ligne (formulaire « Être rappelé »).
  if (plan.priceCents > 0 && !(await salesOpen(tx))) throw new AppError("sales_paused");
  // Déjà cliente : le changement de pack se fait depuis son espace.
  const [membership] = await tx.select().from(memberships).where(eq(memberships.userId, userId)).limit(1);
  if (membership) throw new AppError("already_customer");
  const phone = normalizePhone(input.phone, "FR", "phone");

  const open = (await ordersOfUser(tx, userId)).find((row) =>
    (OPEN_STATUSES as readonly string[]).includes(row.order.status),
  );
  if (open && open.order.status !== "awaiting_payment") throw new AppError("order_in_progress");

  const months = Number(await getPlatformSetting(tx, "commitment_months"));
  // Formule sans engagement proposée ou non (sinon : engagement obligatoire, création offerte).
  const noCommitmentOffered = Boolean(await getPlatformSetting(tx, "offer_no_commitment"));
  // Options : seules les options commandables (tarif fixé, livrées) et leurs dépendances.
  const catalog = await listPlanOptions(tx);
  const optionCodes = resolveOptions(input.optionCodes, catalog.map(pricedOption));
  if (input.optionCodes.some((code) => !optionCodes.includes(code)))
    throw new AppError("option_unavailable", "optionCodes");
  if (optionCodes.length > 0 && plan.priceCents <= 0) throw new AppError("invalid", "optionCodes");
  // À l'année : seulement si proposé, pour un pack payant, et sans option (facturées chaque mois).
  const yearly = input.billingInterval === "year";
  if (yearly && (plan.priceCents <= 0 || !(await getPlatformSetting(tx, "yearly_billing_enabled"))))
    throw new AppError("invalid", "billingInterval");
  if (yearly && optionCodes.length > 0) throw new AppError("option_monthly_only", "optionCodes");
  const values = {
    planId: plan.id,
    optionCodes,
    // Pack gratuit, ou aucune formule avec engagement proposée : sans engagement.
    // À l'année, les 12 mois sont payés d'avance : c'est un engagement (offre tablette comprise).
    withCommitment:
      plan.priceCents > 0 && (yearly || (months > 0 && (input.withCommitment || !noCommitmentOffered))),
    billingInterval: input.billingInterval,
    businessName: input.businessName,
    activity: input.activity,
    phone: phone ?? input.phone,
    currentWebsite: input.currentWebsite ?? null,
    locale: input.locale,
  };
  const free = plan.priceCents <= 0;
  // Une commande payante non réglée est reprise (nouveau choix ou nouvelles coordonnées).
  const [order] = open
    ? await tx
        .update(orders)
        .set({ ...values, status: free ? "awaiting_review" : "awaiting_payment" })
        .where(eq(orders.id, open.order.id))
        .returning()
    : await tx
        .insert(orders)
        .values({ ...values, userId, status: free ? "awaiting_review" : "awaiting_payment" })
        .returning();

  // Offre de lancement (ex. tablette) : une place est retenue si le pack et la formule y donnent droit.
  if (!free) {
    await reserveForOrder(tx, {
      orderId: order.id,
      userId,
      planId: plan.id,
      withCommitment: order.withCommitment,
    });
  }

  if (free) {
    await queueOrderAlerts(tx, order.id, input.locale);
    return { kind: "submitted", orderId: order.id };
  }

  if (!gateway) throw new AppError("payments_unavailable");
  const customerId =
    order.stripeCustomerId ??
    (
      await gateway
        .createCustomer({ email: user.email, name: input.businessName, metadata: { order_id: order.id } })
        .catch(providerError)
    ).id;
  const setupFeeCents = await creationFeeFor(tx, plan, order.withCommitment);
  const optionPriceIds: string[] = [];
  for (const option of catalog.filter((item) => optionCodes.includes(item.code))) {
    optionPriceIds.push(await ensureOptionPrice(tx, option.id, gateway).catch(providerError));
  }
  const checkout = await gateway
    .createCheckout({
      customerId,
      priceId: await ensurePlanPrice(tx, plan.id, gateway, order.billingInterval),
      optionPriceIds,
      setupFee:
        setupFeeCents > 0
          ? {
              amountCents: setupFeeCents,
              currency: plan.currency,
              label: (await getTranslator(resolveLocale(input.locale)))("billing.setupFeeLabel"),
            }
          : null,
      taxRateId: await ensureTaxRate(tx, gateway),
      ...urls(order.id),
      metadata: {
        order_id: order.id,
        plan_id: plan.id,
        commitment: order.withCommitment ? "yes" : "no",
        interval: order.billingInterval,
      },
    })
    .catch(providerError);
  await tx
    .update(orders)
    .set({ stripeCustomerId: customerId, stripeCheckoutSessionId: checkout.id })
    .where(eq(orders.id, order.id));
  return { kind: "redirect", url: checkout.url, orderId: order.id };
}

function providerError(error: unknown): never {
  if (error instanceof AppError) throw error;
  console.error("[commande]", error);
  throw new AppError("payment_provider_error");
}

async function queueOrderAlerts(tx: Transaction, orderId: string, locale: string) {
  await queueMessage(tx, {
    tenantId: null,
    template: "admin.new_order",
    data: { orderId },
    dedupeKey: `admin.new_order:${orderId}`,
  });
  await queueMessage(tx, {
    tenantId: null,
    template: "account.order_received",
    locale,
    data: { orderId },
    dedupeKey: `account.order_received:${orderId}`,
  });
}

/** Paiement de la commande confirmé par Stripe (événement ou retour du professionnel). */
export async function markOrderPaid(
  tx: Transaction,
  input: { orderId: string; subscriptionId: string; customerId: string | null },
  now = new Date(),
) {
  if (!/^[0-9a-f-]{36}$/i.test(input.orderId)) return { outcome: "unknown_order" as const };
  const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) return { outcome: "unknown_order" as const };
  if (order.status !== "awaiting_payment" && order.status !== "abandoned")
    return { outcome: "already_paid" as const };
  await tx
    .update(orders)
    .set({
      status: "paid",
      paidAt: now,
      stripeSubscriptionId: input.subscriptionId,
      stripeCustomerId: input.customerId ?? order.stripeCustomerId,
    })
    .where(eq(orders.id, order.id));
  // Place de l'offre de lancement confirmée par le premier paiement (éligibilité vérifiée ensuite).
  await confirmOrderClaim(tx, order.id, now);
  await queueOrderAlerts(tx, order.id, order.locale);
  return { outcome: "paid" as const };
}

/** Retour sur la page de confirmation : l'état du paiement est relu chez Stripe. */
export async function syncOrderPayment(
  tx: Transaction,
  userId: string,
  orderId: string,
  gateway: BillingGateway | null,
) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const [order] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
  if (!order) return null;
  if (order.status === "awaiting_payment" && order.stripeCheckoutSessionId && gateway) {
    const checkout = await gateway.retrieveCheckout(order.stripeCheckoutSessionId).catch(providerError);
    if (checkout.status === "complete" && checkout.subscriptionId) {
      await markOrderPaid(tx, {
        orderId,
        subscriptionId: checkout.subscriptionId,
        customerId: checkout.customerId,
      });
      return { ...order, status: "paid" as const };
    }
  }
  return order;
}

/** Commandes à traiter par l'administratrice, les plus anciennes d'abord. */
export async function listPendingOrders(tx: Transaction) {
  return tx
    .select({
      order: orders,
      planName: plans.name,
      planCode: plans.code,
      email: users.email,
      userName: users.name,
    })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(inArray(orders.status, ["awaiting_review", "paid", "in_creation"]))
    .orderBy(asc(orders.createdAt));
}

/** Commandes qui attendent l'administratrice (vérification ou création du site à lancer). */
export async function countWaitingOrders(tx: Transaction) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(inArray(orders.status, ["awaiting_review", "paid"]));
  return row?.count ?? 0;
}

export async function getOrder(tx: Transaction, orderId: string) {
  const [row] = await tx
    .select({
      order: orders,
      planCode: plans.code,
      planName: plans.name,
      email: users.email,
      userName: users.name,
    })
    .from(orders)
    .innerJoin(plans, eq(plans.id, orders.planId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId));
  return row ?? null;
}

/**
 * Le site vient d'être créé à partir de la commande : la commande passe « en
 * création » et l'abonnement déjà payé est rattaché à l'établissement.
 */
export async function linkOrderToTenant(
  tx: Transaction,
  orderId: string,
  tenantId: string,
  gateway: BillingGateway | null,
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new AppError("not_found");
  if (!["awaiting_review", "paid"].includes(order.status)) throw new AppError("order_not_pending");
  await tx.update(orders).set({ status: "in_creation", tenantId }).where(eq(orders.id, order.id));
  await linkOrderClaimToTenant(tx, order.id, tenantId);
  if (order.stripeSubscriptionId) {
    await tx
      .insert(subscriptions)
      .values({ tenantId, planId: order.planId, stripeCustomerId: order.stripeCustomerId, status: "none" })
      .onConflictDoNothing();
    if (!gateway) throw new AppError("payments_unavailable");
    const remote = await gateway.retrieveSubscription(order.stripeSubscriptionId).catch(providerError);
    await applySubscription(tx, remote);
  }
  return { orderId: order.id };
}

/** Le site est activé : la commande est terminée et le professionnel est prévenu. */
export async function completeOrdersOfTenant(tx: Transaction, tenantId: string) {
  const done = await tx
    .update(orders)
    .set({ status: "done" })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "in_creation")))
    .returning();
  for (const order of done) {
    await queueMessage(tx, {
      tenantId,
      template: "account.site_live",
      locale: order.locale,
      data: { orderId: order.id },
      dedupeKey: `account.site_live:${order.id}`,
    });
  }
  return done.length;
}

/** Demande refusée (ex. Basic hors cible). Un abonnement déjà payé est arrêté tout de suite. */
export async function rejectOrder(
  tx: Transaction,
  orderId: string,
  reason: string,
  gateway: BillingGateway | null,
) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new AppError("not_found");
  if (!["awaiting_review", "paid"].includes(order.status)) throw new AppError("order_not_pending");
  if (order.stripeSubscriptionId) {
    if (!gateway) throw new AppError("payments_unavailable");
    await gateway.cancelNow(order.stripeSubscriptionId).catch(providerError);
  }
  await tx
    .update(orders)
    .set({ status: "rejected", rejectionReason: reason.trim().slice(0, 500) || null })
    .where(eq(orders.id, order.id));
  await releaseOrderClaim(tx, order.id);
  await queueMessage(tx, {
    tenantId: null,
    template: "account.order_rejected",
    locale: order.locale,
    data: { orderId: order.id },
    dedupeKey: `account.order_rejected:${order.id}`,
  });
  return { refundNeeded: Boolean(order.paidAt) };
}
