import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import {
  appointments,
  businesses,
  openingHours,
  plans,
  services,
  staffMembers,
  staffSchedules,
  staffServices,
  businessSettings,
  tenants,
  timeOff,
  type PlanFeatures,
  type PlanLimits,
} from "@/db/schema";
import { AppError } from "@/modules/errors";
import { currentPeriod } from "@/modules/tenants/queries";
import { usageCounters } from "@/db/schema";
import { activePromotionPrices } from "@/modules/promotions/promotions";
import { computeTotals } from "./pricing";
import { computeDaySlots, type Interval, type Slot, type StaffInput } from "./slots";
import { addDays, localToUtc } from "./time";

/**
 * Disponibilités d'un établissement, lues dans la base (rôle du tenant) puis
 * calculées par computeDaySlots.
 */

export type BookingContext = Awaited<ReturnType<typeof loadBookingContext>>;

/**
 * Contexte de réservation d'UNE entreprise (celle déclarée pour la transaction,
 * ou celle passée en paramètre) : ses réglages, ses prestations, son équipe.
 */
export async function loadBookingContext(tx: Transaction, tenantId: string, businessId?: string) {
  const targetId = businessId ?? (await currentBusinessId(tx));
  if (!targetId) throw new AppError("not_found");
  const [row] = await tx
    .select({
      tenant: tenants,
      business: businesses,
      settings: businessSettings,
      features: plans.features,
      limits: plans.limits,
    })
    .from(tenants)
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .innerJoin(businesses, and(eq(businesses.tenantId, tenants.id), eq(businesses.id, targetId)))
    .innerJoin(businessSettings, eq(businessSettings.businessId, businesses.id))
    .where(eq(tenants.id, tenantId));
  if (!row) throw new AppError("not_found");
  const [serviceRows, staffRows, links] = await Promise.all([
    tx
      .select()
      .from(services)
      .where(and(eq(services.businessId, targetId), eq(services.isActive, true)))
      .orderBy(asc(services.sortOrder)),
    tx
      .select()
      .from(staffMembers)
      .where(and(eq(staffMembers.businessId, targetId), eq(staffMembers.isActive, true)))
      .orderBy(asc(staffMembers.sortOrder)),
    tx.select().from(staffServices).where(eq(staffServices.businessId, targetId)),
  ]);
  const features = row.features as PlanFeatures;
  // Promotion en cours : le prix réduit est celui de la réservation (et de l'acompte).
  const promoted = features.promotions
    ? await activePromotionPrices(tx, tenantId, {
        timezone: row.tenant.timezone,
        locale: row.tenant.defaultLocale,
      })
    : new Map();
  return {
    tenant: row.tenant,
    business: row.business,
    settings: row.settings,
    features,
    limits: row.limits as PlanLimits,
    services: serviceRows.map((service) => {
      const promotion = promoted.get(service.id);
      return {
        ...service,
        priceCents: promotion?.priceCents ?? service.priceCents,
        regularPriceCents: service.priceCents,
        promotion: promotion ?? null,
      };
    }),
    staff: staffRows.map((member) => ({
      id: member.id,
      name: member.name,
      sortOrder: member.sortOrder,
      serviceIds: links.filter((link) => link.staffId === member.id).map((link) => link.serviceId),
    })),
  };
}

/** Prestations choisies : actives, réservables en ligne (sauf ajout manuel), dans la limite du nombre autorisé. */
export function resolveServices(context: BookingContext, serviceIds: string[], { onlineOnly = true } = {}) {
  const unique = [...new Set(serviceIds)];
  if (unique.length === 0) throw new AppError("service_unavailable", "serviceIds");
  if (unique.length > context.settings.maxServicesPerBooking)
    throw new AppError("too_many_services", "serviceIds");
  const chosen = unique.map((id) => context.services.find((service) => service.id === id));
  if (chosen.some((service) => !service || (onlineOnly && !service.isOnlineBookable))) {
    throw new AppError("service_unavailable", "serviceIds");
  }
  const list = chosen as NonNullable<(typeof chosen)[number]>[];
  return { services: list, totals: computeTotals(list) };
}

/** Membres capables de réaliser TOUTES les prestations choisies (décision n° 3). */
export function eligibleStaff(context: BookingContext, serviceIds: string[], staffId: string | null) {
  return context.staff.filter(
    (member) =>
      serviceIds.every((id) => member.serviceIds.includes(id)) && (!staffId || member.id === staffId),
  );
}

/** Le quota de réservations en ligne du mois est-il atteint (pack Basic) ? */
export async function isOnlineQuotaReached(tx: Transaction, context: BookingContext, now = new Date()) {
  const limit = context.limits.onlineBookingsPerMonth;
  if (limit === null || limit === undefined) return false;
  if (limit <= 0) return true;
  const [usage] = await tx
    .select({ value: usageCounters.onlineBookings })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.tenantId, context.tenant.id),
        eq(usageCounters.period, currentPeriod(context.tenant.timezone, now)),
      ),
    );
  return (usage?.value ?? 0) >= limit;
}

type RangeOptions = {
  serviceIds: string[];
  staffId: string | null;
  fromDate: string;
  days: number;
  now: Date;
  /** Rendez-vous à ignorer (report : l'ancien créneau compte comme libre). */
  excludeAppointmentId?: string;
  onlineOnly?: boolean;
};

/** Créneaux disponibles jour par jour, sur une période (une seule série de lectures). */
export async function getSlotsForRange(
  tx: Transaction,
  context: BookingContext,
  options: RangeOptions,
): Promise<Map<string, Slot[]>> {
  const { totals } = resolveServices(context, options.serviceIds, { onlineOnly: options.onlineOnly ?? true });
  const candidates = eligibleStaff(context, options.serviceIds, options.staffId);
  const result = new Map<string, Slot[]>();
  if (candidates.length === 0) return result;

  const timezone = context.tenant.timezone;
  const rangeStart = localToUtc(options.fromDate, "00:00", timezone);
  const rangeEnd = localToUtc(addDays(options.fromDate, options.days), "00:00", timezone);
  const staffIds = candidates.map((member) => member.id);

  const [hours, schedules, appointmentRows, timeOffRows] = await Promise.all([
    tx.select().from(openingHours).where(eq(openingHours.businessId, context.business.id)),
    tx
      .select()
      .from(staffSchedules)
      .where(and(eq(staffSchedules.tenantId, context.tenant.id), inArray(staffSchedules.staffId, staffIds))),
    tx
      .select({
        id: appointments.id,
        staffId: appointments.staffId,
        start: appointments.startsAt,
        end: appointments.blockedUntil,
        status: appointments.status,
        holdExpiresAt: appointments.holdExpiresAt,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, context.tenant.id),
          inArray(appointments.staffId, staffIds),
          inArray(appointments.status, ["confirmed", "pending_payment"]),
          lt(appointments.startsAt, rangeEnd),
          gt(appointments.blockedUntil, rangeStart),
        ),
      ),
    tx
      .select()
      .from(timeOff)
      .where(
        and(
          eq(timeOff.businessId, context.business.id),
          or(isNull(timeOff.staffId), inArray(timeOff.staffId, staffIds)),
          lt(timeOff.startsAt, rangeEnd),
          gt(timeOff.endsAt, rangeStart),
        ),
      ),
  ]);

  // Une réservation temporaire expirée ne bloque plus le créneau.
  const active = appointmentRows.filter(
    (row) =>
      row.id !== options.excludeAppointmentId &&
      (row.status === "confirmed" || (row.holdExpiresAt !== null && row.holdExpiresAt > options.now)),
  );

  const staffInputs: StaffInput[] = candidates.map((member) => ({
    id: member.id,
    sortOrder: member.sortOrder,
    schedules: schedules
      .filter((schedule) => schedule.staffId === member.id)
      .map((schedule) => ({
        weekday: schedule.weekday,
        startsAt: schedule.startsAt.slice(0, 5),
        endsAt: schedule.endsAt.slice(0, 5),
        validFrom: schedule.validFrom,
        validUntil: schedule.validUntil,
      })),
    appointments: active
      .filter((row) => row.staffId === member.id)
      .map((row) => ({ start: row.start, end: row.end })),
    timeOff: timeOffRows
      .filter((row) => row.staffId === member.id)
      .map((row) => ({ start: row.startsAt, end: row.endsAt })),
  }));
  const closures: Interval[] = timeOffRows
    .filter((row) => row.staffId === null)
    .map((row) => ({ start: row.startsAt, end: row.endsAt }));
  const opening = hours.map((range) => ({
    weekday: range.weekday,
    opensAt: range.opensAt.slice(0, 5),
    closesAt: range.closesAt.slice(0, 5),
  }));

  for (let i = 0; i < options.days; i++) {
    const date = addDays(options.fromDate, i);
    result.set(
      date,
      computeDaySlots({
        date,
        now: options.now,
        rules: {
          timezone,
          minNoticeMinutes: context.settings.minNoticeMinutes,
          maxAdvanceDays: context.settings.maxAdvanceDays,
          slotIntervalMinutes: context.settings.slotIntervalMinutes,
        },
        durationMinutes: totals.durationMinutes,
        bufferMinutes: totals.bufferMinutes,
        openingHours: opening,
        closures,
        staff: staffInputs,
      }),
    );
  }
  return result;
}

/** Minutes déjà réservées par membre sur une journée (pour « sans préférence »). */
export async function bookedMinutesOn(tx: Transaction, context: BookingContext, date: string, now: Date) {
  const dayStart = localToUtc(date, "00:00", context.tenant.timezone);
  const dayEnd = localToUtc(addDays(date, 1), "00:00", context.tenant.timezone);
  const rows = await tx
    .select({
      staffId: appointments.staffId,
      start: appointments.startsAt,
      end: appointments.endsAt,
      status: appointments.status,
      holdExpiresAt: appointments.holdExpiresAt,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, context.business.id),
        inArray(appointments.status, ["confirmed", "pending_payment"]),
        lt(appointments.startsAt, dayEnd),
        gt(appointments.endsAt, dayStart),
      ),
    );
  const minutes = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "pending_payment" && (!row.holdExpiresAt || row.holdExpiresAt <= now)) continue;
    minutes.set(
      row.staffId,
      (minutes.get(row.staffId) ?? 0) + (row.end.getTime() - row.start.getTime()) / 60000,
    );
  }
  return minutes;
}
