import { sql } from "drizzle-orm";
import { businessForeignKey } from "./tenants";
import {
  boolean,
  char,
  check,
  foreignKey,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, currency, id, localized, timestamps, utc } from "./_helpers";
import { appointments } from "./bookings";
import { planOptions, plans } from "./platform";
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
    /** Rempli automatiquement avec l'entreprise en cours (app_current_business()). */
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
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
    businessForeignKey("payments_business_fk", t, "restrict"),
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
    /** Rempli automatiquement avec l'entreprise en cours (app_current_business()). */
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    paymentId: uuid().notNull(),
    stripeRefundId: text(),
    amountCents: cents().notNull(),
    reason: text(),
    status: refundStatusEnum().notNull().default("pending"),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("refunds_business_fk", t, "restrict"),
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
    /** Prix Stripe facturé aujourd'hui (peut être un ancien prix du pack, gardé jusqu'à la fin de l'engagement). */
    stripePriceId: text(),
    /** Passage au prix actuel du pack : date annoncée au client (préavis), puis appliquée à cette date. */
    priceChangeAt: utc(),
    priceChangeNotifiedAt: utc(),
    /** Formule choisie à la souscription : avec engagement (création offerte) ou sans (frais de création). null : abonnement antérieur à ce choix. */
    withCommitment: boolean(),
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

/**
 * Options actives d'un site. Avec un abonnement Stripe en cours, elles suivent
 * les lignes de l'abonnement (une ligne par option) ; sinon l'administratrice
 * les active à la main. Seul le rôle plateforme les modifie.
 */
export const tenantOptions = pgTable(
  "tenant_options",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    optionId: uuid()
      .notNull()
      .references(() => planOptions.id, { onDelete: "restrict" }),
    /** Ligne de l'abonnement Stripe qui facture l'option (null : activée à la main). */
    stripeSubscriptionItemId: text(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("tenant_options_tenant_option_key").on(t.tenantId, t.optionId)],
);

// ─── Offre de lancement (ex. tablette offerte aux premiers abonnés Business) ───

/**
 * Offre limitée à un nombre réel de bénéficiaires, réglée dans l'admin.
 * Les places prises se comptent dans launch_offer_claims : l'offre s'arrête
 * d'elle-même quand le quota est atteint.
 */
export const launchOffers = pgTable(
  "launch_offers",
  {
    id: id(),
    code: text().notNull(),
    planId: uuid()
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    isActive: boolean().notNull().default(false),
    /** Nombre maximal de bénéficiaires. */
    quota: integer().notNull(),
    /** Réservée aux souscriptions avec engagement. */
    requiresCommitment: boolean().notNull().default(true),
    title: localized().notNull(),
    conditions: localized().notNull(),
    endsAt: utc(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("launch_offers_code_key").on(t.code),
    check("launch_offers_quota", sql`${t.quota} >= 0`),
  ],
);

export const launchOfferClaimStatusEnum = pgEnum("launch_offer_claim_status", [
  /** Place retenue à la commande, en attente du paiement. */
  "reserved",
  /** Premier paiement reçu : éligibilité à vérifier par l'équipe. */
  "pending_review",
  "eligible",
  "shipped",
  /** Non éligible, ou commande abandonnée : la place est libérée. */
  "refused",
  "cancelled",
]);

/** Places attribuées : une par commande, puis par établissement. */
export const launchOfferClaims = pgTable(
  "launch_offer_claims",
  {
    id: id(),
    offerId: uuid()
      .notNull()
      .references(() => launchOffers.id, { onDelete: "restrict" }),
    orderId: uuid(),
    tenantId: uuid().references(() => tenants.id, { onDelete: "set null" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    status: launchOfferClaimStatusEnum().notNull().default("reserved"),
    note: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("launch_offer_claims_order_key").on(t.offerId, t.orderId),
    index("launch_offer_claims_status_idx").on(t.offerId, t.status),
  ],
);

// ─── Compteurs de consommation mensuels (outils intelligents, etc.) ──────────

/**
 * Consommation d'un quota mensuel (clé de PlanLimits) par site et par mois.
 * La période (AAAA-MM) remet le compteur à zéro chaque mois ; l'alerte
 * n'est envoyée qu'une fois par mois et par quota.
 */
export const quotaUsage = pgTable(
  "quota_usage",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    period: text().notNull(),
    key: text().notNull(),
    used: integer().notNull().default(0),
    /** Crédits achetés en plus pour ce mois (recharges volontaires). */
    extra: integer().notNull().default(0),
    warnedAt: utc(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("quota_usage_tenant_period_key").on(t.tenantId, t.period, t.key),
    check("quota_usage_counts", sql`${t.used} >= 0 and ${t.extra} >= 0`),
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
    /** Formule choisie : avec engagement (création offerte) ou sans (frais de création payés à la commande). */
    withCommitment: boolean().notNull().default(true),
    /** Options choisies à la commande (codes), facturées avec le pack. */
    optionCodes: jsonb().$type<string[]>().notNull().default([]),
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

// ─── Cartes cadeaux ───────────────────────────────────────────────────────────

export const giftCardStatusEnum = pgEnum("gift_card_status", ["pending_payment", "active", "cancelled"]);

/**
 * Cartes cadeaux vendues sur le site. Une carte appartient à l'entreprise qui
 * l'a encaissée (sur son compte Stripe) et ne s'utilise que chez elle.
 * Le code n'est jamais conservé en clair : seulement son empreinte et ses
 * 4 derniers caractères (pour la reconnaître dans les listes).
 * « Utilisée » (solde nul) et « expirée » se déduisent du solde et de la date.
 */
export const giftCards = pgTable(
  "gift_cards",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    codeHash: char({ length: 64 }).notNull(),
    codeLast4: char({ length: 4 }).notNull(),
    status: giftCardStatusEnum().notNull().default("pending_payment"),
    initialCents: cents().notNull(),
    balanceCents: cents().notNull(),
    currency: currency().notNull().default("EUR"),
    purchaserName: text().notNull(),
    purchaserEmail: text().notNull(),
    recipientName: text(),
    recipientEmail: text(),
    message: text(),
    /** Envoi de la carte : tout de suite, ou à la date choisie par l'acheteuse. */
    sendAt: utc().notNull(),
    expiresAt: utc().notNull(),
    stripePaymentIntentId: text(),
    stripeAccountId: text(),
    paidAt: utc(),
    locale: text().notNull().default("fr"),
    /** Carte créée par la gérante (vendue sur place), sans paiement en ligne. */
    soldOnSite: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("gift_cards_business_fk", t, "restrict"),
    unique("gift_cards_business_id_key").on(t.businessId, t.id),
    uniqueIndex("gift_cards_code_hash_key").on(t.codeHash),
    uniqueIndex("gift_cards_payment_intent_key").on(t.stripePaymentIntentId),
    index("gift_cards_tenant_created_idx").on(t.tenantId, t.createdAt),
    check(
      "gift_cards_amounts",
      sql`${t.initialCents} > 0 and ${t.balanceCents} >= 0 and ${t.balanceCents} <= ${t.initialCents}`,
    ),
  ],
);

export const giftCardTransactionKindEnum = pgEnum("gift_card_transaction_kind", [
  "purchase",
  "redeem_online",
  "redeem_on_site",
  "credit_back",
]);

/** Mouvements d'une carte : achat, utilisation en ligne ou sur place, recrédit après annulation. */
export const giftCardTransactions = pgTable(
  "gift_card_transactions",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    giftCardId: uuid().notNull(),
    kind: giftCardTransactionKindEnum().notNull(),
    /** Positif : crédit ; négatif : utilisation. */
    amountCents: integer().notNull(),
    appointmentId: uuid(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    note: text(),
    createdAt: utc().notNull().defaultNow(),
  },
  (t) => [
    businessForeignKey("gift_card_transactions_business_fk", t, "restrict"),
    foreignKey({
      name: "gift_card_transactions_card_fk",
      columns: [t.businessId, t.giftCardId],
      foreignColumns: [giftCards.businessId, giftCards.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "gift_card_transactions_appointment_fk",
      columns: [t.businessId, t.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }).onDelete("restrict"),
    index("gift_card_transactions_card_idx").on(t.giftCardId, t.createdAt),
    index("gift_card_transactions_appointment_idx").on(t.appointmentId),
  ],
);

// ─── SMS supplémentaires ──────────────────────────────────────────────────────

export const smsPackStatusEnum = pgEnum("sms_pack_status", ["pending_payment", "paid", "expired"]);

/**
 * Packs de SMS achetés par la gérante (paiement sur le compte de la plateforme).
 * Ils ne servent qu'une fois le quota du mois épuisé, les plus anciens d'abord,
 * et restent disponibles tant que l'abonnement est actif (« expired » ensuite).
 */
export const smsPacks = pgTable(
  "sms_packs",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    status: smsPackStatusEnum().notNull().default("pending_payment"),
    quantity: integer().notNull(),
    /** SMS encore disponibles dans ce pack. */
    remaining: integer().notNull(),
    priceCents: cents().notNull(),
    currency: currency().notNull().default("EUR"),
    stripeCheckoutSessionId: text(),
    purchasedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    paidAt: utc(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("sms_packs_checkout_session_key").on(t.stripeCheckoutSessionId),
    index("sms_packs_tenant_idx").on(t.tenantId, t.status, t.paidAt),
    check(
      "sms_packs_quantities",
      sql`${t.quantity} > 0 and ${t.remaining} >= 0 and ${t.remaining} <= ${t.quantity} and ${t.priceCents} >= 0`,
    ),
  ],
);
