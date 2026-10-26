import {
  bigint,
  integer,
  foreignKey,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { businessForeignKey } from "./tenants";
import { sql } from "drizzle-orm";
import { id, timestamps, utc } from "./_helpers";
import { appointments } from "./bookings";
import { tenants } from "./tenants";
import { users } from "./users";

/**
 * Famille H : messages automatiques, demandes de mise à jour, journal admin,
 * suivi technique.
 */

export const messageChannelEnum = pgEnum("message_channel", ["email", "sms", "push"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "blocked_quota",
  "skipped",
]);

/**
 * File d'envoi et trace de chaque e-mail, SMS ou notification.
 * Un message est d'abord ajouté « queued » (dans la même transaction que
 * l'action qui le déclenche), puis envoyé ; en cas d'échec il est réessayé.
 * Le contenu est préparé au moment de l'envoi, à partir des données à jour.
 */
export const messageLog = pgTable(
  "message_log",
  {
    id: id(),
    tenantId: uuid().references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid().default(sql`app_current_business()`),
    appointmentId: uuid(),
    channel: messageChannelEnum().notNull(),
    templateKey: text().notNull(),
    /** Adresse ou numéro : renseigné au moment de l'envoi. */
    recipient: text(),
    locale: text().notNull(),
    status: messageStatusEnum().notNull().default("queued"),
    /** Informations propres au message (montant remboursé, période d'un résumé…). */
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** Clé qui empêche d'ajouter deux fois le même message (ex. « daily:<tenant>:<date> »). */
    dedupeKey: text(),
    attempts: integer().notNull().default(0),
    nextAttemptAt: utc(),
    providerMessageId: text(),
    error: text(),
    sentAt: utc(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("message_log_business_fk", t, "cascade"),
    index("message_log_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("message_log_queue_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'queued'`),
    foreignKey({
      name: "message_log_appointment_fk",
      columns: [t.tenantId, t.appointmentId],
      foreignColumns: [appointments.tenantId, appointments.id],
    }).onDelete("cascade"),
    uniqueIndex("message_log_dedupe_key").on(t.dedupeKey),
  ],
);

/** Téléphones de la gérante abonnés aux notifications. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userAgent: text(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_key").on(t.endpoint)],
);

export const updateRequestStatusEnum = pgEnum("update_request_status", [
  "new",
  "in_progress",
  "done",
  "rejected",
]);

/** Demandes de mise à jour envoyées par la gérante à l'administratrice. */
export const updateRequests = pgTable(
  "update_requests",
  {
    id: id(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Entreprise qui a envoyé la demande : seule elle la voit (site à plusieurs entreprises). */
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    subject: text().notNull(),
    message: text().notNull(),
    attachmentAssetIds: uuid()
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    status: updateRequestStatusEnum().notNull().default("new"),
    resolvedAt: utc(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("update_requests_business_fk", t, "cascade"),
    index("update_requests_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

/**
 * Journal des actions de l'administratrice. Ajout seul : une règle en base
 * interdit toute modification ou suppression (voir drizzle/0002_*).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    // Pas de lien (clé étrangère) vers users / tenants : le journal garde la trace
    // même après la suppression d'un compte ou d'un client, et n'est jamais modifié.
    actorUserId: uuid(),
    action: text().notNull(),
    tenantId: uuid(),
    targetType: text(),
    targetId: text(),
    details: jsonb().notNull().default({}),
    ip: inet(),
    createdAt: utc().notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_tenant_idx").on(t.tenantId, t.createdAt),
  ],
);

/**
 * Notifications de l'espace gérante : jusqu'où chaque gérante a regardé, par
 * entreprise. Les notifications elles-mêmes sont les messages envoyés aux
 * gérantes (message_log) : rien n'est écrit en double.
 */
export const managerNotificationReads = pgTable(
  "manager_notification_reads",
  {
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seenAt: utc().notNull(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("manager_notification_reads_business_fk", t, "cascade"),
    primaryKey({ columns: [t.businessId, t.userId] }),
  ],
);

export const backupStatusEnum = pgEnum("backup_status", ["running", "succeeded", "failed"]);

/** Historique des sauvegardes de la base. */
export const backupRuns = pgTable("backup_runs", {
  id: id(),
  status: backupStatusEnum().notNull().default("running"),
  startedAt: utc().notNull().defaultNow(),
  finishedAt: utc(),
  sizeBytes: bigint({ mode: "number" }),
  storageKey: text(),
  error: text(),
});
