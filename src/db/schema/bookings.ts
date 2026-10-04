import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  char,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cents, currency, id, localized, timestamps, utc } from "./_helpers";
import { services, staffMembers } from "./content";
import { tenants } from "./tenants";

/**
 * Famille F : clientes et rendez-vous.
 *
 * Garde-fou anti-doublon : une contrainte d'exclusion (ajoutée dans une
 * migration SQL, voir drizzle/0002_*) interdit deux rendez-vous actifs qui se
 * chevauchent pour le même membre.
 */

const tenantRef = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

/** Clientes finales (sans compte). */
export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantRef(),
    firstName: text().notNull(),
    lastName: text(),
    email: text(),
    /** Format international E.164 : +33612345678. */
    phone: text(),
    locale: text().notNull().default("fr"),
    notes: text(),
    emailConsent: boolean().notNull().default(false),
    smsConsent: boolean().notNull().default(false),
    consentAt: utc(),
    ...timestamps(),
  },
  (t) => [
    unique("customers_tenant_id_key").on(t.tenantId, t.id),
    uniqueIndex("customers_tenant_email_key")
      .on(t.tenantId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
    index("customers_tenant_phone_idx").on(t.tenantId, t.phone),
    check("customers_phone_e164", sql`${t.phone} is null or ${t.phone} ~ '^\\+[1-9][0-9]{6,14}$'`),
    check("customers_contact", sql`${t.email} is not null or ${t.phone} is not null`),
  ],
);

export const discountTypeEnum = pgEnum("discount_type", ["percent", "fixed"]);

export const promoCodes = pgTable(
  "promo_codes",
  {
    id: id(),
    tenantId: tenantRef(),
    code: text().notNull(),
    description: localized(),
    discountType: discountTypeEnum().notNull(),
    /** Pourcentage (10 = 10 %) ou montant en centimes. */
    discountValue: integer().notNull(),
    validFrom: utc(),
    validUntil: utc(),
    maxUses: integer(),
    usedCount: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    unique("promo_codes_tenant_id_key").on(t.tenantId, t.id),
    uniqueIndex("promo_codes_tenant_code_key").on(t.tenantId, sql`upper(${t.code})`),
    check("promo_codes_value", sql`${t.discountValue} > 0`),
    check("promo_codes_percent", sql`${t.discountType} <> 'percent' or ${t.discountValue} <= 100`),
    check("promo_codes_uses", sql`${t.maxUses} is null or ${t.usedCount} <= ${t.maxUses}`),
  ],
);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "pending_payment",
  "confirmed",
  "cancelled",
  "attended",
  "no_show",
  "expired",
]);
export const appointmentSourceEnum = pgEnum("appointment_source", ["online", "manual"]);
export const cancelledByEnum = pgEnum("cancelled_by", ["customer", "manager", "admin", "system"]);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid().notNull(),
    staffId: uuid().notNull(),
    /** Début et fin visibles par la cliente (somme des durées des prestations). */
    startsAt: utc().notNull(),
    endsAt: utc().notNull(),
    /** Fin réelle de l'occupation de l'agenda : endsAt + temps de battement. */
    blockedUntil: utc().notNull(),
    status: appointmentStatusEnum().notNull(),
    source: appointmentSourceEnum().notNull(),
    /** Fin de la réservation temporaire du créneau pendant le paiement. */
    holdExpiresAt: utc(),
    totalCents: cents().notNull(),
    discountCents: cents().notNull().default(0),
    depositCents: cents().notNull().default(0),
    currency: currency().notNull().default("EUR"),
    promoCodeId: uuid(),
    /** Empreinte du lien « annuler / déplacer » envoyé par e-mail. */
    manageTokenHash: char({ length: 64 }),
    cancelledAt: utc(),
    cancelledBy: cancelledByEnum(),
    cancellationReason: text(),
    rescheduledFromId: uuid(),
    locale: text().notNull().default("fr"),
    customerNote: text(),
    internalNote: text(),
    ...timestamps(),
  },
  (t) => [
    unique("appointments_tenant_id_key").on(t.tenantId, t.id),
    uniqueIndex("appointments_manage_token_key").on(t.manageTokenHash),
    index("appointments_tenant_starts_idx").on(t.tenantId, t.startsAt),
    index("appointments_tenant_staff_starts_idx").on(t.tenantId, t.staffId, t.startsAt),
    index("appointments_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("appointments_hold_idx")
      .on(t.holdExpiresAt)
      .where(sql`${t.status} = 'pending_payment'`),
    foreignKey({
      name: "appointments_customer_fk",
      columns: [t.tenantId, t.customerId],
      foreignColumns: [customers.tenantId, customers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_staff_fk",
      columns: [t.tenantId, t.staffId],
      foreignColumns: [staffMembers.tenantId, staffMembers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_promo_code_fk",
      columns: [t.tenantId, t.promoCodeId],
      foreignColumns: [promoCodes.tenantId, promoCodes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "appointments_rescheduled_from_fk",
      columns: [t.tenantId, t.rescheduledFromId],
      foreignColumns: [t.tenantId, t.id],
    }).onDelete("restrict"),
    check("appointments_range", sql`${t.startsAt} < ${t.endsAt} and ${t.endsAt} <= ${t.blockedUntil}`),
    check(
      "appointments_amounts",
      sql`${t.totalCents} >= 0 and ${t.discountCents} >= 0 and ${t.depositCents} >= 0 and ${t.depositCents} <= ${t.totalCents}`,
    ),
    check("appointments_hold", sql`${t.status} <> 'pending_payment' or ${t.holdExpiresAt} is not null`),
  ],
);

/** Prestations d'un rendez-vous (1 à 3), figées au moment de la réservation. */
export const appointmentItems = pgTable(
  "appointment_items",
  {
    id: id(),
    tenantId: tenantRef(),
    appointmentId: uuid().notNull(),
    serviceId: uuid(),
    position: smallint().notNull(),
    serviceName: localized().notNull(),
    durationMinutes: smallint().notNull(),
    bufferMinutes: smallint().notNull().default(0),
    priceCents: cents().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("appointment_items_position_key").on(t.appointmentId, t.position),
    foreignKey({
      name: "appointment_items_appointment_fk",
      columns: [t.tenantId, t.appointmentId],
      foreignColumns: [appointments.tenantId, appointments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "appointment_items_service_fk",
      columns: [t.tenantId, t.serviceId],
      foreignColumns: [services.tenantId, services.id],
    }).onDelete("restrict"),
    check("appointment_items_duration", sql`${t.durationMinutes} > 0`),
    check("appointment_items_price", sql`${t.priceCents} >= 0`),
  ],
);

/** Compteurs mensuels par tenant (quota Basic, SMS, e-mails). */
export const usageCounters = pgTable(
  "usage_counters",
  {
    tenantId: tenantRef(),
    /** Mois concerné, au format AAAA-MM, dans le fuseau du tenant. */
    period: char({ length: 7 }).notNull(),
    onlineBookings: integer().notNull().default(0),
    smsSent: integer().notNull().default(0),
    emailsSent: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.period] }),
    check("usage_counters_period", sql`${t.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);
