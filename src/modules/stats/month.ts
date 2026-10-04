import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { addDays, localToUtc } from "@/modules/booking/time";

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
