import { and, desc, eq, like } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { messageLog } from "@/db/schema";

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
  // À la gérante
  "manager.new_booking",
  "manager.cancelled",
  "manager.rescheduled",
  "manager.daily_summary",
  "manager.monthly_summary",
  "manager.basic_quota",
] as const;

export type MessageTemplate = (typeof MESSAGE_TEMPLATES)[number];

export function channelOf(template: MessageTemplate) {
  return template === "customer.reminder_sms" ? ("sms" as const) : ("email" as const);
}

export async function queueMessage(
  tx: Transaction,
  input: {
    tenantId: string;
    template: MessageTemplate;
    appointmentId?: string | null;
    locale?: string;
    data?: Record<string, unknown>;
    /** Par défaut : un seul message de ce type par rendez-vous. */
    dedupeKey?: string | null;
  },
) {
  const dedupeKey =
    input.dedupeKey !== undefined
      ? input.dedupeKey
      : input.appointmentId
        ? `${input.template}:${input.appointmentId}`
        : null;
  await tx
    .insert(messageLog)
    .values({
      tenantId: input.tenantId,
      appointmentId: input.appointmentId ?? null,
      channel: channelOf(input.template),
      templateKey: input.template,
      locale: input.locale ?? "fr",
      data: input.data ?? {},
      dedupeKey,
    })
    .onConflictDoNothing({ target: messageLog.dedupeKey });
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
