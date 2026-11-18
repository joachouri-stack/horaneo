import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, like, lt, ne, or, sql } from "drizzle-orm";
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
  options: {
    from: Date;
    to: Date;
    staffId?: string | null;
    locale: Locale;
    includeCancelled?: boolean;
    /** Seulement ces rendez-vous (résultats d'une recherche), quelle que soit la période. */
    ids?: string[];
  },
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
        options.ids ? inArray(appointments.id, options.ids) : lt(appointments.startsAt, options.to),
        options.ids ? undefined : gt(appointments.endsAt, options.from),
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
  /** Un seul membre (collaborateur limité à son agenda) ; par défaut toute l'équipe. */
  staffId: string | null = null,
) {
  const today = utcToLocal(now, timezone).date;
  const { start, end } = dayRange(today, timezone);
  const list = await listAgenda(tx, tenantId, { from: start, to: end, locale, staffId });
  const counted = list.filter((item) => item.status !== "no_show");
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.source, "online"),
        staffId ? eq(appointments.staffId, staffId) : undefined,
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

/** Prochains rendez-vous à venir (accueil quand la journée est vide). */
export async function upcomingAppointments(
  tx: Transaction,
  tenantId: string,
  options: { timezone: string; locale: Locale; days?: number; limit?: number; staffId?: string | null },
  now = new Date(),
) {
  const tomorrow = addDays(utcToLocal(now, options.timezone).date, 1);
  const { start, end } = dayRange(tomorrow, options.timezone, options.days ?? 14);
  const list = await listAgenda(tx, tenantId, {
    from: start,
    to: end,
    locale: options.locale,
    staffId: options.staffId,
  });
  return list
    .filter((item) => item.status === "confirmed" || item.status === "pending_payment")
    .slice(0, options.limit ?? 3);
}

/** Un rendez-vous avec tous ses détails (écran de la gérante). */
export async function getAppointmentDetail(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  locale: Locale,
) {
  const [row] = await tx
    .select({ startsAt: appointments.startsAt, groupId: appointments.groupId })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));
  if (!row) return null;
  const list = await listAgenda(tx, tenantId, {
    from: new Date(row.startsAt.getTime() - 1),
    to: new Date(row.startsAt.getTime() + 1),
    locale,
    includeCancelled: true,
  });
  const item = list.find((entry) => entry.id === appointmentId);
  if (!item) return null;
  // Réservation à plusieurs collaboratrices : les autres parties, dans l'ordre.
  const linked = row.groupId
    ? await tx
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          staffName: staffMembers.name,
          lead: sql<boolean>`${appointments.id} = ${appointments.groupId}`,
        })
        .from(appointments)
        .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
        .where(
          and(
            eq(appointments.tenantId, tenantId),
            eq(appointments.groupId, row.groupId),
            ne(appointments.id, appointmentId),
          ),
        )
        .orderBy(asc(appointments.startsAt))
    : [];
  return { ...item, linked, isLead: !row.groupId || row.groupId === appointmentId };
}

/**
 * Recherche de rendez-vous (barre « Trouver un rendez-vous » de l'agenda) : par nom,
 * téléphone ou e-mail du client. Les prochains d'abord (du plus proche au plus
 * lointain), puis les passés (du plus récent au plus ancien).
 */
export async function searchAppointments(
  tx: Transaction,
  tenantId: string,
  options: { query: string; locale: Locale; staffId?: string | null; now?: Date; limit?: number },
) {
  const words = options.query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0 || options.query.trim().length < 2) return [];
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const digits = options.query.replace(/\D/g, "");
  // Chaque mot doit se retrouver dans le prénom, le nom, l'e-mail ou le téléphone.
  const matches = and(
    ...words.map((word) => {
      const pattern = `%${word.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
      return or(
        ilike(customers.firstName, pattern),
        ilike(customers.lastName, pattern),
        ilike(customers.email, pattern),
        digits.length >= 4 ? like(customers.phone, `%${digits.slice(-9)}%`) : undefined,
      );
    }),
  );
  const window = async (upcoming: boolean) => {
    const rows = await tx
      .select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .innerJoin(customers, eq(customers.id, appointments.customerId))
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.status, [...VISIBLE_STATUSES]),
          options.staffId ? eq(appointments.staffId, options.staffId) : undefined,
          upcoming ? gte(appointments.startsAt, now) : lt(appointments.startsAt, now),
          matches,
        ),
      )
      .orderBy(upcoming ? asc(appointments.startsAt) : desc(appointments.startsAt))
      .limit(limit);
    return rows;
  };
  const found = [...(await window(true)), ...(await window(false))];
  if (found.length === 0) return [];
  // Détail complet (client, membre, prestations), dans l'ordre trouvé.
  const detailed = await listAgenda(tx, tenantId, {
    from: now,
    to: now,
    locale: options.locale,
    ids: found.map((row) => row.id),
  });
  const byId = new Map(detailed.map((row) => [row.id, row]));
  return found.map((row) => byId.get(row.id)).filter((row) => row !== undefined);
}
