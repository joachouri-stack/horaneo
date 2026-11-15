import { and, asc, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  appointments,
  customers,
  openingHours,
  products,
  services,
  shopOrderItems,
  shopOrders,
  staffMembers,
  staffSchedules,
  timeOff,
} from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { addDays, isoWeekday, localToUtc, utcToLocal } from "@/modules/booking/time";
import { salesBreakdown } from "./margins";
import { availableMinutes, fillRate } from "./occupancy";

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

/** Bornes d'un mois (AAAA-MM) : premier jour, nombre de jours, instants de début et de fin (exclue). */
function monthRange(period: string, timezone: string) {
  const [year, month] = period.split("-").map(Number);
  const first = `${period}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return {
    first,
    days: Math.round((Date.parse(next) - Date.parse(first)) / 86_400_000),
    from: localToUtc(first, "00:00", timezone),
    to: localToUtc(next, "00:00", timezone),
  };
}

/**
 * Chiffre d'affaires et marge du mois par prestation et par produit de la boutique.
 * - Prestations : lignes des rendez-vous du mois (prix figé à la réservation, avant code
 *   promo), hors rendez-vous annulés, expirés et absences — comme le chiffre d'affaires.
 * - Produits : articles des commandes payées dans le mois (payées, prêtes ou retirées ;
 *   annulées et remboursées exclues), prix unitaire × quantité.
 * La marge utilise le coût de revient ACTUEL de la prestation ou du produit (pas
 * d'historique des coûts) ; une prestation ou un produit supprimé n'a plus de coût connu.
 */
export async function monthSales(
  tx: Transaction,
  tenantId: string,
  period: string,
  timezone: string,
  locale: Locale,
) {
  const { from, to } = monthRange(period, timezone);
  const serviceItems = await tx
    .select({
      serviceId: appointmentItems.serviceId,
      name: appointmentItems.serviceName,
      priceCents: appointmentItems.priceCents,
    })
    .from(appointmentItems)
    .innerJoin(appointments, eq(appointments.id, appointmentItems.appointmentId))
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        gte(appointments.startsAt, from),
        lt(appointments.startsAt, to),
        sql`${appointments.status} not in ('cancelled', 'expired', 'no_show')`,
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(appointmentItems.position));
  const serviceIds = [...new Set(serviceItems.flatMap((item) => (item.serviceId ? [item.serviceId] : [])))];
  const serviceCosts = serviceIds.length
    ? await tx
        .select({ id: services.id, costCents: services.costCents })
        .from(services)
        .where(and(eq(services.tenantId, tenantId), inArray(services.id, serviceIds)))
    : [];
  const productItems = await tx
    .select({
      productId: shopOrderItems.productId,
      name: shopOrderItems.name,
      unitPriceCents: shopOrderItems.unitPriceCents,
      quantity: shopOrderItems.quantity,
    })
    .from(shopOrderItems)
    .innerJoin(shopOrders, eq(shopOrders.id, shopOrderItems.orderId))
    .where(
      and(
        eq(shopOrders.tenantId, tenantId),
        inArray(shopOrders.status, ["paid", "ready", "collected"]),
        gte(shopOrders.paidAt, from),
        lt(shopOrders.paidAt, to),
      ),
    )
    .orderBy(asc(shopOrders.paidAt));
  const productIds = [...new Set(productItems.flatMap((item) => (item.productId ? [item.productId] : [])))];
  const productCosts = productIds.length
    ? await tx
        .select({ id: products.id, costCents: products.costCents })
        .from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.id, productIds)))
    : [];
  return {
    services: salesBreakdown(
      serviceItems.map((item) => {
        const name = pickLocalized(item.name, locale);
        return {
          // Prestation supprimée depuis : regroupée par son nom (coût inconnu).
          key: item.serviceId ?? `name:${name}`,
          name,
          quantity: 1,
          revenueCents: item.priceCents,
        };
      }),
      new Map(serviceCosts.map((row) => [row.id, row.costCents])),
    ),
    products: salesBreakdown(
      productItems.map((item) => ({
        key: item.productId ?? `name:${item.name}`,
        name: item.name,
        quantity: item.quantity,
        revenueCents: item.unitPriceCents * item.quantity,
      })),
      new Map(productCosts.map((row) => [row.id, row.costCents])),
    ),
  };
}

/**
 * Taux de remplissage du mois, pour toute l'équipe et par membre actif.
 * - Disponible : horaires du membre valables chaque jour (ou, s'il n'en a aucun, horaires
 *   d'ouverture de son entreprise), moins ses congés et les fermetures de l'entreprise.
 * - Réservé : durée (début → fin, sans le temps de battement) des rendez-vous du membre
 *   commençant dans le mois, hors annulés et expirés ; les absences comptent (créneau occupé).
 * Le taux vaut null quand aucune minute n'est disponible ; il peut dépasser 100 % si des
 * rendez-vous sont pris en dehors des horaires.
 */
export async function monthOccupancy(tx: Transaction, tenantId: string, period: string, timezone: string) {
  const { first, days, from, to } = monthRange(period, timezone);
  const staff = await tx
    .select({
      id: staffMembers.id,
      businessId: staffMembers.businessId,
      name: staffMembers.name,
      color: staffMembers.color,
    })
    .from(staffMembers)
    .where(and(eq(staffMembers.tenantId, tenantId), eq(staffMembers.isActive, true)))
    .orderBy(asc(staffMembers.sortOrder), asc(staffMembers.name));
  if (staff.length === 0) return { rate: null, bookedMinutes: 0, availableMinutes: 0, staff: [] };
  const staffIds = staff.map((member) => member.id);
  const [schedules, hours, offs, booked] = await Promise.all([
    tx
      .select()
      .from(staffSchedules)
      .where(and(eq(staffSchedules.tenantId, tenantId), inArray(staffSchedules.staffId, staffIds))),
    tx.select().from(openingHours).where(eq(openingHours.tenantId, tenantId)),
    tx
      .select()
      .from(timeOff)
      .where(and(eq(timeOff.tenantId, tenantId), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from))),
    tx
      .select({ staffId: appointments.staffId, startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          inArray(appointments.staffId, staffIds),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
          sql`${appointments.status} not in ('cancelled', 'expired')`,
        ),
      ),
  ]);
  const members = staff.map((member) => {
    const available = availableMinutes({
      timezone,
      firstDate: first,
      days,
      schedules: schedules
        .filter((schedule) => schedule.staffId === member.id)
        .map((schedule) => ({
          weekday: schedule.weekday,
          startsAt: schedule.startsAt.slice(0, 5),
          endsAt: schedule.endsAt.slice(0, 5),
          validFrom: schedule.validFrom,
          validUntil: schedule.validUntil,
        })),
      openingHours: hours
        .filter((range) => range.businessId === member.businessId)
        .map((range) => ({
          weekday: range.weekday,
          opensAt: range.opensAt.slice(0, 5),
          closesAt: range.closesAt.slice(0, 5),
        })),
      timeOff: offs
        .filter((off) =>
          off.staffId === null ? off.businessId === member.businessId : off.staffId === member.id,
        )
        .map((off) => ({ start: off.startsAt, end: off.endsAt })),
    });
    const bookedMinutes = Math.round(
      booked
        .filter((row) => row.staffId === member.id)
        .reduce((sum, row) => sum + (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000, 0),
    );
    return {
      id: member.id,
      name: member.name,
      color: member.color,
      bookedMinutes,
      availableMinutes: available,
      rate: fillRate(bookedMinutes, available),
    };
  });
  const bookedMinutes = members.reduce((sum, member) => sum + member.bookedMinutes, 0);
  const totalAvailable = members.reduce((sum, member) => sum + member.availableMinutes, 0);
  return {
    rate: fillRate(bookedMinutes, totalAvailable),
    bookedMinutes,
    availableMinutes: totalAvailable,
    staff: members,
  };
}
