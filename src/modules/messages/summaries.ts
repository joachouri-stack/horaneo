import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers, staffMembers } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { addDays, localToUtc } from "@/modules/booking/time";

/** Rendez-vous confirmés d'une journée (résumé du lendemain envoyé à la gérante). */
export async function dailyAgenda(
  tx: Transaction,
  tenantId: string,
  date: string,
  timezone: string,
  locale: Locale,
) {
  const rows = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      firstName: customers.firstName,
      lastName: customers.lastName,
      staff: staffMembers.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.status, "confirmed"),
        gte(appointments.startsAt, localToUtc(date, "00:00", timezone)),
        lt(appointments.startsAt, localToUtc(addDays(date, 1), "00:00", timezone)),
      ),
    )
    .orderBy(asc(appointments.startsAt));
  if (rows.length === 0) return [];
  const items = await tx
    .select({ appointmentId: appointmentItems.appointmentId, name: appointmentItems.serviceName })
    .from(appointmentItems)
    .where(
      inArray(
        appointmentItems.appointmentId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(appointmentItems.position));
  return rows.map((row) => ({
    startsAt: row.startsAt,
    customer: [row.firstName, row.lastName].filter(Boolean).join(" "),
    staff: row.staff,
    services: items
      .filter((item) => item.appointmentId === row.id)
      .map((item) => pickLocalized(item.name, locale)),
  }));
}
