import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  appointments,
  customers,
  giftCards,
  payments,
  promoCodes,
  serviceCategories,
  services,
  staffMembers,
} from "@/db/schema";

/**
 * Toutes les données d'une entreprise, pour que la gérante les récupère (avant de résilier
 * ou à tout moment). À appeler avec le rôle du tenant et l'entreprise de la gérante : la base
 * ne renvoie que ses propres données. Valeurs brutes ; libellés et formats sont choisis à l'export.
 */
export async function businessDataExport(tx: Transaction, tenantId: string) {
  const past = sql`${appointments.status} in ('confirmed','attended')`;
  const stats = tx
    .select({
      customerId: appointments.customerId,
      visits: sql<number>`count(*) filter (where ${past} and ${appointments.startsAt} <= now())`
        .mapWith(Number)
        .as("visits"),
      spentCents:
        sql<number>`coalesce(sum(${appointments.totalCents}) filter (where ${past} and ${appointments.startsAt} <= now()), 0)`
          .mapWith(Number)
          .as("spent_cents"),
    })
    .from(appointments)
    .where(eq(appointments.tenantId, tenantId))
    .groupBy(appointments.customerId)
    .as("stats");

  const customerRows = await tx
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      birthMonth: customers.birthMonth,
      birthDay: customers.birthDay,
      notes: customers.notes,
      emailConsent: customers.emailConsent,
      smsConsent: customers.smsConsent,
      anonymizedAt: customers.anonymizedAt,
      createdAt: customers.createdAt,
      visits: sql<number>`coalesce(${stats.visits}, 0)`.mapWith(Number),
      spentCents: sql<number>`coalesce(${stats.spentCents}, 0)`.mapWith(Number),
    })
    .from(customers)
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(eq(customers.tenantId, tenantId))
    .orderBy(asc(customers.lastName), asc(customers.firstName));

  const appointmentRows = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      totalCents: appointments.totalCents,
      discountCents: appointments.discountCents,
      depositCents: appointments.depositCents,
      currency: appointments.currency,
      customerNote: appointments.customerNote,
      internalNote: appointments.internalNote,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      staffName: staffMembers.name,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .where(eq(appointments.tenantId, tenantId))
    .orderBy(asc(appointments.startsAt));
  const ids = appointmentRows.map((row) => row.id);
  const itemRows = ids.length
    ? await tx
        .select({ appointmentId: appointmentItems.appointmentId, serviceName: appointmentItems.serviceName })
        .from(appointmentItems)
        .where(inArray(appointmentItems.appointmentId, ids))
        .orderBy(asc(appointmentItems.appointmentId), asc(appointmentItems.position))
    : [];
  const itemsByAppointment = new Map<string, (typeof itemRows)[number]["serviceName"][]>();
  for (const item of itemRows) {
    itemsByAppointment.set(item.appointmentId, [
      ...(itemsByAppointment.get(item.appointmentId) ?? []),
      item.serviceName,
    ]);
  }

  const serviceRows = await tx
    .select({
      name: services.name,
      category: serviceCategories.name,
      durationMinutes: services.durationMinutes,
      priceCents: services.priceCents,
      priceFrom: services.priceFrom,
      currency: services.currency,
      isActive: services.isActive,
      isOnlineBookable: services.isOnlineBookable,
    })
    .from(services)
    .leftJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(eq(services.tenantId, tenantId))
    .orderBy(asc(services.sortOrder));

  const paymentRows = await tx
    .select({
      createdAt: payments.createdAt,
      amountCents: payments.amountCents,
      currency: payments.currency,
      status: payments.status,
      appointmentStartsAt: appointments.startsAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
    })
    .from(payments)
    .leftJoin(appointments, eq(appointments.id, payments.appointmentId))
    .leftJoin(customers, eq(customers.id, appointments.customerId))
    .where(eq(payments.tenantId, tenantId))
    .orderBy(asc(payments.createdAt));

  const giftCardRows = await tx
    .select({
      codeLast4: giftCards.codeLast4,
      status: giftCards.status,
      initialCents: giftCards.initialCents,
      balanceCents: giftCards.balanceCents,
      currency: giftCards.currency,
      purchaserName: giftCards.purchaserName,
      purchaserEmail: giftCards.purchaserEmail,
      recipientName: giftCards.recipientName,
      paidAt: giftCards.paidAt,
      expiresAt: giftCards.expiresAt,
    })
    .from(giftCards)
    .where(eq(giftCards.tenantId, tenantId))
    .orderBy(asc(giftCards.createdAt));

  const promoRows = await tx
    .select({
      code: promoCodes.code,
      discountType: promoCodes.discountType,
      discountValue: promoCodes.discountValue,
      validFrom: promoCodes.validFrom,
      validUntil: promoCodes.validUntil,
      maxUses: promoCodes.maxUses,
      usedCount: promoCodes.usedCount,
      isActive: promoCodes.isActive,
    })
    .from(promoCodes)
    .where(eq(promoCodes.tenantId, tenantId))
    .orderBy(asc(promoCodes.createdAt));

  return {
    customers: customerRows,
    appointments: appointmentRows.map((row) => ({ ...row, services: itemsByAppointment.get(row.id) ?? [] })),
    services: serviceRows,
    payments: paymentRows,
    giftCards: giftCardRows,
    promoCodes: promoRows,
  };
}

export type BusinessDataExport = Awaited<ReturnType<typeof businessDataExport>>;
