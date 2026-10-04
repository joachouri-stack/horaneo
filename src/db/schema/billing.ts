import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, currency, id, timestamps, utc } from "./_helpers";
import { appointments } from "./bookings";
import { plans } from "./platform";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Famille G : paiements.
 * - Acomptes : Stripe Connect en paiements directs (l'argent va au professionnel).
 * - Abonnements : Stripe Billing.
 * Les traces de paiement sont conservées pour la comptabilité : un tenant n'est
 * jamais supprimé physiquement tant qu'elles existent (suppression de ses
 * contenus et anonymisation à la place).
 */

export const paymentStatusEnum = pgEnum("payment_status", [
  "requires_payment",
  "processing",
  "succeeded",
  "canceled",
  "failed",
]);

/** Acomptes versés par les clientes. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    appointmentId: uuid(),
    stripePaymentIntentId: text().notNull(),
    stripeAccountId: text().notNull(),
    amountCents: cents().notNull(),
    applicationFeeCents: cents().notNull().default(0),
    currency: currency().notNull(),
    status: paymentStatusEnum().notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("payments_tenant_id_key").on(t.tenantId, t.id),
    uniqueIndex("payments_payment_intent_key").on(t.stripePaymentIntentId),
    index("payments_appointment_idx").on(t.tenantId, t.appointmentId),
    // Pas de suppression en cascade : le paiement survit au rendez-vous.
    foreignKey({
      name: "payments_appointment_fk",
      columns: [t.tenantId, t.appointmentId],
      foreignColumns: [appointments.tenantId, appointments.id],
    }).onDelete("restrict"),
    check("payments_amount", sql`${t.amountCents} > 0 and ${t.applicationFeeCents} >= 0`),
  ],
);

export const refundStatusEnum = pgEnum("refund_status", ["pending", "succeeded", "failed", "canceled"]);

export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    paymentId: uuid().notNull(),
    stripeRefundId: text(),
    amountCents: cents().notNull(),
    reason: text(),
    status: refundStatusEnum().notNull().default("pending"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("refunds_stripe_refund_key").on(t.stripeRefundId),
    foreignKey({
      name: "refunds_payment_fk",
      columns: [t.tenantId, t.paymentId],
      foreignColumns: [payments.tenantId, payments.id],
    }).onDelete("restrict"),
    check("refunds_amount", sql`${t.amountCents} > 0`),
  ],
);

/**
 * Abonnement du professionnel au SaaS (Stripe Billing) : une ligne par
 * établissement, mise à jour au fil des événements Stripe.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    stripeCustomerId: text(),
    stripeSubscriptionId: text(),
    /** Statut Stripe : active, past_due, canceled, unpaid, incomplete… (« none » avant la première souscription). */
    status: text().notNull(),
    currentPeriodEnd: utc(),
    /** Fin programmée de l'abonnement payant (passage au Basic). */
    cancelAt: utc(),
    cancelRequestedAt: utc(),
    commitmentEndsAt: utc(),
    /** Pack inférieur choisi, appliqué à la fin de la période en cours. */
    scheduledPlanId: uuid().references(() => plans.id, { onDelete: "set null" }),
    /** Dernier échec de prélèvement (effacé quand un paiement réussit). */
    paymentFailedAt: utc(),
    lastPaymentError: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("subscriptions_stripe_subscription_key").on(t.stripeSubscriptionId),
    uniqueIndex("subscriptions_tenant_key").on(t.tenantId),
    uniqueIndex("subscriptions_stripe_customer_key").on(t.stripeCustomerId),
  ],
);

export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment",
  "awaiting_review",
  "paid",
  "in_creation",
  "done",
  "rejected",
  "abandoned",
]);

/** Commandes passées sur le site commercial, avant la création du site. */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    businessName: text().notNull(),
    activity: text().notNull(),
    phone: text().notNull(),
    currentWebsite: text(),
    locale: text().notNull().default("fr"),
    status: orderStatusEnum().notNull(),
    stripeCheckoutSessionId: text(),
    /** Abonnement créé par le paiement de la commande (avant que le site existe). */
    stripeCustomerId: text(),
    stripeSubscriptionId: text(),
    paidAt: utc(),
    /** Motif communiqué au professionnel si la demande est refusée. */
    rejectionReason: text(),
    /** Renseigné quand l'administratrice a créé le site. */
    tenantId: uuid().references(() => tenants.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
    uniqueIndex("orders_subscription_key").on(t.stripeSubscriptionId),
    uniqueIndex("orders_checkout_session_key").on(t.stripeCheckoutSessionId),
  ],
);

/**
 * Événements reçus de Stripe. L'identifiant Stripe est la clé : un événement
 * reçu deux fois n'est traité qu'une fois.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  account: text(),
  payload: jsonb().notNull(),
  receivedAt: utc().notNull().defaultNow(),
  processedAt: utc(),
  error: text(),
});
