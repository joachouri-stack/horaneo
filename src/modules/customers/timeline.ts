import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, customers, messageLog, shopOrders } from "@/db/schema";

/**
 * Historique complet d'une fiche client, en frise : rendez-vous (réservé, venue,
 * absente, annulé), messages qui lui ont été envoyés (confirmation, rappels,
 * demande d'avis…), anniversaire et commandes de la boutique. Lecture seule ;
 * utilisable avec withTenant (gérante) comme withPlatform.
 */

/** Messages envoyés à la cliente, affichés dans la frise (les autres restent internes). */
const MESSAGE_KINDS = [
  "customer.confirmation",
  "customer.reminder_email",
  "customer.reminder_sms",
  "customer.rescheduled",
  "customer.moved",
  "customer.cancelled",
  "customer.review_request",
  "customer.payment_refunded",
  "customer.birthday",
  "customer.winback",
] as const;

const SENT = ["sent", "delivered"] as const;

export type TimelineEvent = {
  /** Clé stable pour l'affichage. */
  id: string;
  at: Date;
  kind:
    | "booked_online"
    | "booked_manual"
    | "attended"
    | "no_show"
    | "cancelled"
    | (typeof MESSAGE_KINDS)[number]
    | "shop_order";
  /** Canal du message (e-mail, SMS…). */
  channel?: string;
  /** Rendez-vous concerné (lien vers sa fiche). */
  appointmentId?: string;
  /** Rendez-vous concerné : sa date (« pour le rendez-vous du … »). */
  appointmentAt?: Date;
  /** Commande de la boutique : montant. */
  amountCents?: number;
  currency?: string;
};

export async function customerTimeline(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  { limit = 40, now = new Date() } = {},
): Promise<TimelineEvent[]> {
  const [customer] = await tx
    .select({ id: customers.id, email: customers.email })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
  if (!customer) return [];

  const rdvs = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      createdAt: appointments.createdAt,
      cancelledAt: appointments.cancelledAt,
      status: appointments.status,
      source: appointments.source,
    })
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.customerId, customerId)));

  const events: TimelineEvent[] = [];
  const startOf = new Map(rdvs.map((rdv) => [rdv.id, rdv.startsAt]));
  for (const rdv of rdvs) {
    // Réservation en attente de paiement jamais réglée : pas un vrai rendez-vous.
    if (rdv.status === "pending_payment") continue;
    events.push({
      id: `booked:${rdv.id}`,
      at: rdv.createdAt,
      kind: rdv.source === "online" ? "booked_online" : "booked_manual",
      appointmentId: rdv.id,
      appointmentAt: rdv.startsAt,
    });
    if (rdv.status === "attended" || rdv.status === "no_show") {
      events.push({
        id: `${rdv.status}:${rdv.id}`,
        // Visite passée : à l'heure du rendez-vous (jamais dans le futur).
        at: rdv.startsAt < now ? rdv.startsAt : now,
        kind: rdv.status,
        appointmentId: rdv.id,
        appointmentAt: rdv.startsAt,
      });
    }
    if (rdv.status === "cancelled") {
      events.push({
        id: `cancelled:${rdv.id}`,
        at: rdv.cancelledAt ?? rdv.createdAt,
        kind: "cancelled",
        appointmentId: rdv.id,
        appointmentAt: rdv.startsAt,
      });
    }
  }

  // Messages liés à ses rendez-vous, et message d'anniversaire (rattaché par sa clé).
  const ids = rdvs.map((rdv) => rdv.id);
  const messages = await tx
    .select({
      id: messageLog.id,
      templateKey: messageLog.templateKey,
      channel: messageLog.channel,
      appointmentId: messageLog.appointmentId,
      sentAt: messageLog.sentAt,
      createdAt: messageLog.createdAt,
    })
    .from(messageLog)
    .where(
      and(
        eq(messageLog.tenantId, tenantId),
        inArray(messageLog.templateKey, [...MESSAGE_KINDS]),
        inArray(messageLog.status, [...SENT]),
        sql`(${ids.length > 0 ? inArray(messageLog.appointmentId, ids) : sql`false`} or ${like(
          messageLog.dedupeKey,
          `customer.birthday:${customer.id}:%`,
        )} or ${like(messageLog.dedupeKey, `customer.winback:${customer.id}:%`)})`,
      ),
    );
  for (const message of messages) {
    events.push({
      id: `message:${message.id}`,
      at: message.sentAt ?? message.createdAt,
      kind: message.templateKey as (typeof MESSAGE_KINDS)[number],
      channel: message.channel,
      appointmentId: message.appointmentId ?? undefined,
      appointmentAt: message.appointmentId ? startOf.get(message.appointmentId) : undefined,
    });
  }

  // Commandes de la boutique passées avec son adresse e-mail (payées ou plus loin).
  if (customer.email) {
    const ordersOf = await tx
      .select({
        id: shopOrders.id,
        at: sql<Date>`coalesce(${shopOrders.paidAt}, ${shopOrders.createdAt})`.mapWith(
          (value) => new Date(value),
        ),
        totalCents: shopOrders.totalCents,
        currency: shopOrders.currency,
      })
      .from(shopOrders)
      .where(
        and(
          eq(shopOrders.tenantId, tenantId),
          sql`lower(${shopOrders.customerEmail}) = lower(${customer.email})`,
          inArray(shopOrders.status, ["paid", "ready", "collected", "refunded"]),
        ),
      )
      .orderBy(desc(shopOrders.createdAt))
      .limit(limit);
    for (const order of ordersOf) {
      events.push({
        id: `order:${order.id}`,
        at: order.at,
        kind: "shop_order",
        amountCents: order.totalCents,
        currency: order.currency,
      });
    }
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
