import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, customers, giftCards, managerNotificationReads, messageLog } from "@/db/schema";
import type { MessageTemplate } from "@/modules/messages/queue";

/**
 * Notifications de l'espace gérante : les mêmes événements que les e-mails
 * envoyés aux gérantes (réservation en ligne, annulation, report, carte cadeau
 * vendue, demande de données). Elles sont lues dans la file des messages ;
 * seule la date de dernière consultation est enregistrée, par gérante.
 */

export const NOTIFICATION_TEMPLATES = [
  "manager.new_booking",
  "manager.cancelled",
  "manager.rescheduled",
  "manager.gift_card_sold",
  "manager.data_request",
] as const satisfies readonly MessageTemplate[];

export type NotificationKind = (typeof NOTIFICATION_TEMPLATES)[number] extends `manager.${infer K}`
  ? K
  : never;

/** Notifications des 30 derniers jours, les plus récentes d'abord. */
export const NOTIFICATION_DAYS = 30;
export const NOTIFICATION_LIMIT = 50;

export type ManagerNotification = {
  id: string;
  kind: NotificationKind;
  at: Date;
  unseen: boolean;
  appointmentId: string | null;
  customer: string;
  startsAt: Date | null;
  amountCents: number | null;
  currency: string | null;
  requestKind: "export" | "deletion" | null;
};

const since = (now: Date) => new Date(now.getTime() - NOTIFICATION_DAYS * 24 * 3600 * 1000);

const baseFilter = (tenantId: string, now: Date) =>
  and(
    eq(messageLog.tenantId, tenantId),
    inArray(messageLog.templateKey, [...NOTIFICATION_TEMPLATES]),
    ne(messageLog.status, "skipped"),
    gt(messageLog.createdAt, since(now)),
  );

async function seenAt(tx: Transaction, userId: string) {
  // L'entreprise est celle déclarée pour la transaction (règles par ligne).
  const [row] = await tx
    .select({ seenAt: managerNotificationReads.seenAt })
    .from(managerNotificationReads)
    .where(eq(managerNotificationReads.userId, userId));
  return row?.seenAt ?? null;
}

/** Nombre de notifications pas encore vues (pastille de la cloche). */
export async function unseenNotificationCount(
  tx: Transaction,
  tenantId: string,
  input: { userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const seen = await seenAt(tx, input.userId);
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(messageLog)
    .where(and(baseFilter(tenantId, now), seen ? gt(messageLog.createdAt, seen) : undefined));
  return row?.count ?? 0;
}

export async function listNotifications(
  tx: Transaction,
  tenantId: string,
  input: { userId: string; now?: Date },
): Promise<ManagerNotification[]> {
  const now = input.now ?? new Date();
  const seen = await seenAt(tx, input.userId);
  const rows = await tx
    .select({
      id: messageLog.id,
      template: messageLog.templateKey,
      at: messageLog.createdAt,
      data: messageLog.data,
      appointmentId: messageLog.appointmentId,
      startsAt: appointments.startsAt,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(messageLog)
    .leftJoin(
      appointments,
      and(eq(appointments.tenantId, messageLog.tenantId), eq(appointments.id, messageLog.appointmentId)),
    )
    .leftJoin(customers, eq(customers.id, appointments.customerId))
    .where(baseFilter(tenantId, now))
    .orderBy(desc(messageLog.createdAt))
    .limit(NOTIFICATION_LIMIT);

  const cardIds = rows
    .map((row) => (row.data as { giftCardId?: string }).giftCardId)
    .filter((value): value is string => Boolean(value));
  const cards = cardIds.length
    ? await tx
        .select({
          id: giftCards.id,
          purchaserName: giftCards.purchaserName,
          initialCents: giftCards.initialCents,
          currency: giftCards.currency,
        })
        .from(giftCards)
        .where(inArray(giftCards.id, cardIds))
    : [];
  const cardOf = new Map(cards.map((card) => [card.id, card]));

  return rows.map((row) => {
    const data = row.data as { giftCardId?: string; kind?: "export" | "deletion"; customerName?: string };
    const card = data.giftCardId ? cardOf.get(data.giftCardId) : undefined;
    const customer = card
      ? card.purchaserName
      : (data.customerName ?? [row.firstName, row.lastName].filter(Boolean).join(" "));
    return {
      id: row.id,
      kind: row.template.slice("manager.".length) as NotificationKind,
      at: row.at,
      unseen: !seen || row.at > seen,
      appointmentId: row.startsAt ? row.appointmentId : null,
      customer,
      startsAt: row.startsAt,
      amountCents: card?.initialCents ?? null,
      currency: card?.currency ?? null,
      requestKind: data.kind ?? null,
    };
  });
}

/** La gérante a ouvert ses notifications : la pastille disparaît. */
export async function markNotificationsSeen(
  tx: Transaction,
  tenantId: string,
  input: { userId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  await tx
    .insert(managerNotificationReads)
    .values({ tenantId, userId: input.userId, seenAt: now })
    .onConflictDoUpdate({
      target: [managerNotificationReads.businessId, managerNotificationReads.userId],
      set: { seenAt: now, updatedAt: now },
    });
}
