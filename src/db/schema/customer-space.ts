import { sql } from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, id, timestamps, utc } from "./_helpers";
import { appointments, customers } from "./bookings";
import { businessForeignKey, tenants } from "./tenants";
import { users } from "./users";

/**
 * Famille H : espace des clientes (sans compte ni mot de passe) et fidélité.
 *
 * Une cliente est reconnue par son e-mail ou son téléphone, vérifié par un lien
 * ou un code à usage unique. L'espace relie ensuite, entreprise par entreprise,
 * les fiches clientes qui ont exactement cet e-mail ou ce téléphone.
 */

const tenantRef = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

const businessRef = () =>
  uuid()
    .notNull()
    .default(sql`app_current_business()`);

export const customerChannelEnum = pgEnum("customer_channel", ["email", "sms"]);

/**
 * Liens (e-mail) et codes (SMS) de connexion : à usage unique, de courte durée.
 * Seule l'empreinte est conservée. L'identifiant est l'e-mail en minuscules ou
 * le téléphone au format international.
 */
export const customerLoginCodes = pgTable(
  "customer_login_codes",
  {
    id: id(),
    tenantId: tenantRef(),
    channel: customerChannelEnum().notNull(),
    identifier: text().notNull(),
    secretHash: char({ length: 64 }).notNull(),
    expiresAt: utc().notNull(),
    usedAt: utc(),
    /** Codes SMS faux saisis ; au-delà de la limite, le code est refusé. */
    failedAttempts: smallint().notNull().default(0),
    createdAt: utc().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_login_codes_secret_key").on(t.secretHash),
    index("customer_login_codes_identifier_idx").on(t.tenantId, t.identifier, t.createdAt),
  ],
);

/** Sessions des clientes sur le site d'un professionnel (cookie sur son domaine). */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: id(),
    tenantId: tenantRef(),
    channel: customerChannelEnum().notNull(),
    identifier: text().notNull(),
    tokenHash: char({ length: 64 }).notNull(),
    expiresAt: utc().notNull(),
    revokedAt: utc(),
    lastSeenAt: utc().notNull().defaultNow(),
    createdAt: utc().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customer_sessions_token_key").on(t.tokenHash),
    index("customer_sessions_identifier_idx").on(t.tenantId, t.identifier),
  ],
);

export const loyaltyEventKindEnum = pgEnum("loyalty_event_kind", [
  "visit",
  "visit_reverted",
  "manual_adjustment",
  "reward_used",
]);

/**
 * Mouvements du compteur de fidélité d'une cliente, propres à une entreprise.
 * Le compteur est la somme des points. Un rendez-vous ne rapporte qu'une fois.
 */
export const loyaltyEvents = pgTable(
  "loyalty_events",
  {
    id: id(),
    tenantId: tenantRef(),
    businessId: businessRef(),
    customerId: uuid().notNull(),
    kind: loyaltyEventKindEnum().notNull(),
    points: integer().notNull(),
    appointmentId: uuid(),
    reason: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: utc().notNull().defaultNow(),
  },
  (t) => [
    businessForeignKey("loyalty_events_business_fk", t, "cascade"),
    foreignKey({
      name: "loyalty_events_customer_fk",
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "loyalty_events_appointment_fk",
      columns: [t.businessId, t.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }).onDelete("cascade"),
    index("loyalty_events_customer_idx").on(t.businessId, t.customerId, t.createdAt),
    // Un rendez-vous honoré ne rapporte qu'un point (une annulation de la visite peut suivre).
    uniqueIndex("loyalty_events_visit_key")
      .on(t.appointmentId, t.kind)
      .where(sql`${t.kind} in ('visit', 'visit_reverted')`),
    check("loyalty_events_points", sql`${t.points} <> 0`),
  ],
);

/** Bons de fidélité gagnés (avantage figé au moment où il est obtenu). */
export const loyaltyRewards = pgTable(
  "loyalty_rewards",
  {
    id: id(),
    tenantId: tenantRef(),
    businessId: businessRef(),
    customerId: uuid().notNull(),
    label: text().notNull(),
    amountCents: cents(),
    /** Visites nécessaires au moment où le bon a été obtenu (retirées à l'utilisation). */
    visitsRequired: smallint().notNull(),
    expiresAt: utc().notNull(),
    usedAt: utc(),
    usedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("loyalty_rewards_business_fk", t, "cascade"),
    foreignKey({
      name: "loyalty_rewards_customer_fk",
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    // Un seul bon en cours (non utilisé) par cliente et par entreprise.
    uniqueIndex("loyalty_rewards_open_key")
      .on(t.businessId, t.customerId)
      .where(sql`${t.usedAt} is null`),
    check("loyalty_rewards_amount", sql`${t.amountCents} is null or ${t.amountCents} > 0`),
  ],
);

export const dataRequestKindEnum = pgEnum("data_request_kind", ["export", "deletion"]);
export const dataRequestStatusEnum = pgEnum("data_request_status", ["new", "done", "rejected"]);

/** Demandes d'export ou de suppression des données, adressées à une entreprise. */
export const customerDataRequests = pgTable(
  "customer_data_requests",
  {
    id: id(),
    tenantId: tenantRef(),
    businessId: businessRef(),
    customerId: uuid().notNull(),
    kind: dataRequestKindEnum().notNull(),
    status: dataRequestStatusEnum().notNull().default("new"),
    resolvedAt: utc(),
    resolvedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("customer_data_requests_business_fk", t, "cascade"),
    foreignKey({
      name: "customer_data_requests_customer_fk",
      columns: [t.businessId, t.customerId],
      foreignColumns: [customers.businessId, customers.id],
    }).onDelete("cascade"),
    index("customer_data_requests_business_idx").on(t.businessId, t.status, t.createdAt),
  ],
);
