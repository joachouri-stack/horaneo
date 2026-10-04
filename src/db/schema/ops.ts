import {
  bigint,
  integer,
  foreignKey,
  index,
  inet,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
  (t) => [index("update_requests_tenant_created_idx").on(t.tenantId, t.createdAt)],
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
