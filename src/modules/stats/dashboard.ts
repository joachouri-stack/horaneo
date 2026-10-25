import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointments, customers } from "@/db/schema";
import { addDays, utcToLocal } from "@/modules/booking/time";
import { dayRange } from "@/modules/agenda/queries";

/** Rendez-vous qui comptent dans le chiffre d'affaires (ni annulés, ni expirés, ni absences). */
const REVENUE_STATUSES = ["confirmed", "pending_payment", "attended"] as const;

/**
 * Tableau de bord de la gérante : chiffre d'affaires des 7 derniers jours (jour
 * par jour, aujourd'hui compris) comparé aux 7 jours précédents, et nouvelles
 * clientes sur les mêmes périodes. Tout est compté dans le fuseau de l'établissement.
 */
export async function dashboardStats(tx: Transaction, tenantId: string, timezone: string, now = new Date()) {
  const today = utcToLocal(now, timezone).date;
  const first = addDays(today, -6);
  const previousFirst = addDays(today, -13);
  const span = dayRange(previousFirst, timezone, 14);
  const current = dayRange(first, timezone, 7);

  const rows = await tx
    .select({ startsAt: appointments.startsAt, totalCents: appointments.totalCents })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.startsAt, span.start),
        lt(appointments.startsAt, span.end),
        inArray(appointments.status, [...REVENUE_STATUSES]),
      ),
    );
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const byDay = new Map(days.map((day) => [day, 0]));
  let previousCents = 0;
  for (const row of rows) {
    const day = utcToLocal(row.startsAt, timezone).date;
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + row.totalCents);
    else if (row.startsAt < current.start) previousCents += row.totalCents;
  }
  const revenue = days.map((day) => ({ date: day, cents: byDay.get(day) ?? 0 }));
  const weekCents = revenue.reduce((sum, day) => sum + day.cents, 0);

  const created = await tx
    .select({ createdAt: customers.createdAt })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        gte(customers.createdAt, span.start),
        lt(customers.createdAt, span.end),
      ),
    );
  const newCustomers = created.filter((row) => row.createdAt >= current.start).length;

  return {
    today,
    revenue,
    weekCents,
    previousWeekCents: previousCents,
    newCustomers,
    previousNewCustomers: created.length - newCustomers,
  };
}

/** Évolution en pourcentage (arrondie) ; null quand la période de comparaison est vide. */
export function trendPercent(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
