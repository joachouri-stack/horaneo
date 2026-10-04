import { and, asc, eq, gt, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers, staffMembers, timeOff } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { addDays, localToUtc, utcToLocal } from "@/modules/booking/time";

/**
 * Lectures de l'agenda de la gérante (rôle du tenant).
 * Les rendez-vous annulés ou expirés ne sont pas affichés dans l'agenda.
 */

export const VISIBLE_STATUSES = ["confirmed", "pending_payment", "attended", "no_show"] as const;

export function dayRange(date: string, timezone: string, days = 1) {
  return {
    start: localToUtc(date, "00:00", timezone),
    end: localToUtc(addDays(date, days), "00:00", timezone),
  };
}

export async function listAgenda(
  tx: Transaction,
  tenantId: string,
  options: { from: Date; to: Date; staffId?: string | null; locale: Locale; includeCancelled?: boolean },
) {
  const rows = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      blockedUntil: appointments.blockedUntil,
      status: appointments.status,
      source: appointments.source,
      totalCents: appointments.totalCents,
      discountCents: appointments.discountCents,
      depositCents: appointments.depositCents,
      currency: appointments.currency,
      customerNote: appointments.customerNote,
      internalNote: appointments.internalNote,
      createdAt: appointments.createdAt,
      staffId: appointments.staffId,
      staffName: staffMembers.name,
      staffColor: staffMembers.color,
      customerId: customers.id,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerPhone: customers.phone,
      customerEmail: customers.email,
    })
    .from(appointments)
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        lt(appointments.startsAt, options.to),
        gt(appointments.endsAt, options.from),
        options.includeCancelled
          ? ne(appointments.status, "expired")
          : inArray(appointments.status, [...VISIBLE_STATUSES]),
        options.staffId ? eq(appointments.staffId, options.staffId) : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt));
  if (rows.length === 0) return [];
  const items = await tx
    .select({
      appointmentId: appointmentItems.appointmentId,
      name: appointmentItems.serviceName,
      position: appointmentItems.position,
    })
    .from(appointmentItems)
    .where(
      and(
        eq(appointmentItems.tenantId, tenantId),
        inArray(
          appointmentItems.appointmentId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(appointmentItems.position));
  return rows.map((row) => ({
    ...row,
    customerName: [row.customerFirstName, row.customerLastName].filter(Boolean).join(" "),
    services: items
      .filter((item) => item.appointmentId === row.id)
      .map((item) => pickLocalized(item.name, options.locale)),
  }));
}

export type AgendaAppointment = Awaited<ReturnType<typeof listAgenda>>[number];

export async function listTimeOff(
  tx: Transaction,
  tenantId: string,
  from: Date,
  to: Date,
  staffId?: string | null,
) {
  return tx
    .select({
      id: timeOff.id,
      staffId: timeOff.staffId,
      kind: timeOff.kind,
      startsAt: timeOff.startsAt,
      endsAt: timeOff.endsAt,
      reason: timeOff.reason,
      staffName: staffMembers.name,
    })
    .from(timeOff)
    .leftJoin(staffMembers, eq(staffMembers.id, timeOff.staffId))
    .where(
      and(
        eq(timeOff.tenantId, tenantId),
        lt(timeOff.startsAt, to),
        gt(timeOff.endsAt, from),
        staffId ? or(isNull(timeOff.staffId), eq(timeOff.staffId, staffId)) : undefined,
      ),
    )
    .orderBy(asc(timeOff.startsAt));
}

/** Écran « Aujourd'hui » : rendez-vous du jour, chiffre d'affaires prévu, nouvelles réservations. */
export async function todaySummary(
  tx: Transaction,
  tenantId: string,
  timezone: string,
  locale: Locale,
  now = new Date(),
) {
  const today = utcToLocal(now, timezone).date;
  const { start, end } = dayRange(today, timezone);
  const list = await listAgenda(tx, tenantId, { from: start, to: end, locale });
  const counted = list.filter((item) => item.status !== "no_show");
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.source, "online"),
        gte(appointments.createdAt, since),
        inArray(appointments.status, ["confirmed", "pending_payment", "attended"]),
      ),
    );
  const next = list.find(
    (item) => item.endsAt > now && (item.status === "confirmed" || item.status === "pending_payment"),
  );
  return {
    date: today,
    appointments: list,
    count: counted.length,
    revenueCents: counted.reduce((sum, item) => sum + item.totalCents, 0),
    newBookings: recent.length,
    nextId: next?.id ?? null,
  };
}

/** Un rendez-vous avec tous ses détails (écran de la gérante). */
export async function getAppointmentDetail(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  locale: Locale,
) {
  const [row] = await tx
    .select({ startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));
  if (!row) return null;
  const list = await listAgenda(tx, tenantId, {
    from: new Date(row.startsAt.getTime() - 1),
    to: new Date(row.startsAt.getTime() + 1),
    locale,
    includeCancelled: true,
  });
  return list.find((item) => item.id === appointmentId) ?? null;
}
