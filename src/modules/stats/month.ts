import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers, staffMembers } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { addDays, isoWeekday, localToUtc, utcToLocal } from "@/modules/booking/time";

/** Statistiques d'un mois (AAAA-MM) dans le fuseau de l'établissement. */
export async function monthStats(
  tx: Transaction,
  tenantId: string,
  period: string,
  timezone: string,
  locale: Locale,
) {
  const [year, month] = period.split("-").map(Number);
  const first = `${period}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const from = localToUtc(first, "00:00", timezone);
  const to = localToUtc(next, "00:00", timezone);
  const rows = await tx
    .select({
      id: appointments.id,
      status: appointments.status,
      source: appointments.source,
      totalCents: appointments.totalCents,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.startsAt, from),
        lt(appointments.startsAt, to),
        sql`${appointments.status} <> 'expired'`,
      ),
    );
  const active = rows.filter((row) => row.status !== "cancelled");
  const items = active.length
    ? await tx
        .select({ name: appointmentItems.serviceName, appointmentId: appointmentItems.appointmentId })
        .from(appointmentItems)
        .where(sql`${appointmentItems.appointmentId} in ${active.map((row) => row.id)}`)
    : [];
  const topServices = new Map<string, number>();
  for (const item of items) {
    const name = pickLocalized(item.name, locale);
    topServices.set(name, (topServices.get(name) ?? 0) + 1);
  }
  const [{ value: newCustomers }] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(eq(customers.tenantId, tenantId), gte(customers.createdAt, from), lt(customers.createdAt, to)),
    );
  const noShows = rows.filter((row) => row.status === "no_show").length;
  return {
    period,
    appointments: active.length,
    online: active.filter((row) => row.source === "online").length,
    manual: active.filter((row) => row.source === "manual").length,
    cancelled: rows.filter((row) => row.status === "cancelled").length,
    noShows,
    noShowRate: active.length ? noShows / active.length : 0,
    revenueCents: active
      .filter((row) => row.status !== "no_show")
      .reduce((sum, row) => sum + row.totalCents, 0),
    newCustomers,
    topServices: [...topServices.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    nextPeriodStart: addDays(next, 0),
  };
}

/**
 * Détail d'un mois pour les graphiques des statistiques : rendez-vous et chiffre
 * d'affaires jour par jour (en ligne / ajoutés au salon), répartition par membre
 * de l'équipe, par jour de la semaine et par heure, panier moyen et clientes
 * fidèles (déjà venues avant le mois). Rendez-vous annulés et expirés exclus ;
 * les absences ne comptent pas dans le chiffre d'affaires.
 */
export async function monthDetails(tx: Transaction, tenantId: string, period: string, timezone: string) {
  const [year, month] = period.split("-").map(Number);
  const first = `${period}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const from = localToUtc(first, "00:00", timezone);
  const to = localToUtc(next, "00:00", timezone);
  const rows = await tx
    .select({
      startsAt: appointments.startsAt,
      status: appointments.status,
      source: appointments.source,
      totalCents: appointments.totalCents,
      staffId: appointments.staffId,
      staffName: staffMembers.name,
      staffColor: staffMembers.color,
      customerId: appointments.customerId,
      customerCreatedAt: customers.createdAt,
    })
    .from(appointments)
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.startsAt, from),
        lt(appointments.startsAt, to),
        sql`${appointments.status} not in ('cancelled', 'expired')`,
      ),
    );
  const dayCount = Math.round((Date.parse(next) - Date.parse(first)) / 86_400_000);
  const days = Array.from({ length: dayCount }, (_, index) => ({
    date: addDays(first, index),
    online: 0,
    manual: 0,
    revenueCents: 0,
  }));
  const staff = new Map<
    string,
    { name: string; color: string | null; count: number; revenueCents: number }
  >();
  const weekdays = Array.from({ length: 7 }, () => 0);
  const hours = Array.from({ length: 24 }, () => 0);
  const customersSeen = new Set<string>();
  const returning = new Set<string>();
  let revenueCents = 0;
  let paid = 0;
  for (const row of rows) {
    const local = utcToLocal(row.startsAt, timezone);
    const day = days[Number(local.date.slice(8)) - 1];
    const counts = row.status !== "no_show";
    if (day) {
      if (row.source === "online") day.online += 1;
      else day.manual += 1;
      if (counts) day.revenueCents += row.totalCents;
    }
    const member = staff.get(row.staffId) ?? {
      name: row.staffName,
      color: row.staffColor,
      count: 0,
      revenueCents: 0,
    };
    member.count += 1;
    if (counts) member.revenueCents += row.totalCents;
    staff.set(row.staffId, member);
    weekdays[isoWeekday(local.date) - 1] += 1;
    hours[Math.floor(local.minutes / 60)] += 1;
    customersSeen.add(row.customerId);
    if (row.customerCreatedAt < from) returning.add(row.customerId);
    if (counts) {
      revenueCents += row.totalCents;
      paid += 1;
    }
  }
  return {
    days,
    staff: [...staff.values()].sort((a, b) => b.count - a.count),
    weekdays,
    hours,
    averageBasketCents: paid ? Math.round(revenueCents / paid) : 0,
    customers: customersSeen.size,
    returningCustomers: returning.size,
  };
}
