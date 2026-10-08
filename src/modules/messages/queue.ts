import { and, desc, eq, like, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, messageLog } from "@/db/schema";

/**
 * Ajout d'un message à la file d'envoi. Appelé dans la même transaction que
 * l'action qui le déclenche : si l'action est annulée, le message aussi.
 * Le contenu n'est préparé qu'au moment de l'envoi, avec les données à jour.
 */

export const MESSAGE_TEMPLATES = [
  // À la cliente
  "customer.confirmation",
  "customer.reminder_email",
  "customer.reminder_sms",
  "customer.cancelled",
  "customer.rescheduled",
  "customer.moved",
  "customer.payment_refunded",
  "customer.gift_card",
  "customer.gift_card_receipt",
  "customer.login_link",
  "customer.login_code",
  "customer.review_request",
  // À la gérante
  "manager.new_booking",
  "manager.cancelled",
  "manager.rescheduled",
  "manager.daily_summary",
  "manager.monthly_summary",
  "manager.basic_quota",
  "manager.payment_failed",
  "manager.subscription_ended",
  "manager.gift_card_sold",
  "manager.data_request",
  "manager.push_test",
  "manager.stripe_invite",
  // Au professionnel avant que son site existe, et à l'administratrice
  "account.order_received",
  "account.order_rejected",
  "account.site_live",
  "admin.new_order",
] as const;

export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];

export function channelOf(template: MessageTemplate) {
  if (template === "manager.push_test") return "push" as const;
  return template === "customer.reminder_sms" || template === "customer.login_code"
    ? ("sms" as const)
    : ("email" as const);
}

/**
 * Alertes aux gérantes doublées d'une notification sur leurs téléphones
 * (si elles l'ont activée) : mêmes événements que la page Notifications.
 */
export const PUSH_TEMPLATES: readonly MessageTemplate[] = [
  "manager.new_booking",
  "manager.cancelled",
  "manager.rescheduled",
  "manager.gift_card_sold",
  "manager.data_request",
];

export async function queueMessage(
  tx: Transaction,
  input: {
    tenantId: string | null;
    /** Entreprise concernée ; par défaut celle du rendez-vous, ou celle déclarée. */
    businessId?: string | null;
    template: MessageTemplate;
    appointmentId?: string | null;
    locale?: string;
    data?: Record<string, unknown>;
    /** Par défaut : un seul message de ce type par rendez-vous. */
    dedupeKey?: string | null;
    /** Envoi programmé (ex. carte cadeau à offrir à une date choisie). */
    sendAt?: Date;
  },
) {
  const dedupeKey =
    input.dedupeKey !== undefined
      ? input.dedupeKey
      : input.appointmentId
        ? `${input.template}:${input.appointmentId}`
        : null;
  const insert = (channel: ReturnType<typeof channelOf>, key: string | null) =>
    tx
      .insert(messageLog)
      .values({
        tenantId: input.tenantId,
        ...(input.businessId !== undefined
          ? { businessId: input.businessId }
          : input.appointmentId
            ? {
                businessId: sql`(SELECT ${appointments.businessId} FROM ${appointments} WHERE ${appointments.id} = ${input.appointmentId})`,
              }
            : {}),
        appointmentId: input.appointmentId ?? null,
        channel,
        templateKey: input.template,
        locale: input.locale ?? "fr",
        data: input.data ?? {},
        dedupeKey: key,
        nextAttemptAt: input.sendAt ?? null,
      })
      .onConflictDoNothing({ target: messageLog.dedupeKey });
  await insert(channelOf(input.template), dedupeKey);
  if (PUSH_TEMPLATES.includes(input.template)) {
    await insert("push", dedupeKey === null ? null : `push:${dedupeKey}`);
  }
}

/** Messages d'une nouvelle réservation confirmée : confirmation à la cliente, alerte à la gérante. */
export async function queueBookingConfirmed(
  tx: Transaction,
  tenantId: string,
  appointment: { id: string; locale: string; source: "online" | "manual" },
) {
  await queueMessage(tx, {
    tenantId,
    template: "customer.confirmation",
    appointmentId: appointment.id,
    locale: appointment.locale,
  });
  // Un rendez-vous ajouté par la gérante elle-même ne lui est pas signalé.
  if (appointment.source === "online") {
    await queueMessage(tx, { tenantId, template: "manager.new_booking", appointmentId: appointment.id });
  }
}

/** Messages envoyés (ou prévus) à la cliente pour un rendez-vous, du plus récent au plus ancien. */
export async function customerMessagesOf(tx: Transaction, tenantId: string, appointmentId: string) {
  return tx
    .select({
      id: messageLog.id,
      template: messageLog.templateKey,
      status: messageLog.status,
      sentAt: messageLog.sentAt,
      createdAt: messageLog.createdAt,
    })
    .from(messageLog)
    .where(
      and(
        eq(messageLog.tenantId, tenantId),
        eq(messageLog.appointmentId, appointmentId),
        like(messageLog.templateKey, "customer.%"),
      ),
    )
    .orderBy(desc(messageLog.createdAt));
}
