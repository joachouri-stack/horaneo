"use server";

import { z } from "zod";
import { withTenant } from "@/db/access";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import { getSlotsForRange, isOnlineQuotaReached, loadBookingContext } from "@/modules/booking/availability";
import { createBooking } from "@/modules/booking/create";
import { cancelByCustomer, findByManageToken, rescheduleByCustomer } from "@/modules/booking/manage";
import { addDays, DATE_PATTERN, utcToLocal } from "@/modules/booking/time";
import { AppError, type AppErrorCode } from "@/modules/errors";

/**
 * Actions du parcours de réservation (site public, sans compte).
 * Le tenant vient du domaine ; les entrées sont validées ; les tentatives sont limitées.
 */

export type PublicResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorCode; field?: string };

async function run<T>(fn: () => Promise<T>): Promise<PublicResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code, field: error.field };
    if (error instanceof z.ZodError)
      return { ok: false, error: "invalid", field: String(error.issues[0]?.path.join(".") ?? "") };
    throw error;
  }
}

export type DayAvailability = { date: string; slots: { start: string; time: string; staffIds: string[] }[] };

const availabilityInput = z.object({
  serviceIds: z.array(z.uuid()).min(1).max(10),
  staffId: z.uuid().nullable(),
  fromDate: z.string().regex(DATE_PATTERN).optional(),
  days: z.number().int().min(1).max(14).default(14),
  /** Report d'un rendez-vous : son lien de gestion. */
  manageToken: z.string().max(80).optional(),
});

/** Créneaux libres sur une période (14 jours maximum par appel). */
export async function getAvailabilityAction(
  raw: z.input<typeof availabilityInput>,
): Promise<PublicResult<DayAvailability[]>> {
  return run(async () => {
    const input = availabilityInput.parse(raw);
    const site = await currentSiteTenant();
    if (!publicLimits.availability.attempt(site.ip)) throw new AppError("rate_limited");
    return withTenant(site.tenantId, async (tx) => {
      const now = new Date();
      let context = await loadBookingContext(tx, site.tenantId);
      let excludeAppointmentId: string | undefined;
      let serviceIds = input.serviceIds;
      if (input.manageToken) {
        const managed = await findByManageToken(tx, site.tenantId, input.manageToken);
        if (!managed) throw new AppError("not_found");
        context = managed.context;
        excludeAppointmentId = managed.appointment.id;
        serviceIds = managed.items.map((item) => item.serviceId).filter((id): id is string => Boolean(id));
      } else if (await isOnlineQuotaReached(tx, context, now)) {
        throw new AppError("booking_quota_reached");
      }
      const today = utcToLocal(now, context.tenant.timezone).date;
      const fromDate = input.fromDate && input.fromDate > today ? input.fromDate : today;
      const days = await getSlotsForRange(tx, context, {
        serviceIds,
        staffId: input.staffId,
        fromDate,
        days: Math.min(input.days, 14),
        now,
        excludeAppointmentId,
        onlineOnly: !input.manageToken,
      });
      const limit = addDays(today, context.settings.maxAdvanceDays);
      return [...days.entries()]
        .filter(([date]) => date <= limit)
        .map(([date, slots]) => ({
          date,
          slots: slots.map((slot) => ({
            start: slot.start.toISOString(),
            time: slot.time,
            staffIds: slot.staffIds,
          })),
        }));
    });
  });
}

const bookInput = z.object({
  serviceIds: z.array(z.uuid()).min(1).max(10),
  staffId: z.uuid().nullable(),
  start: z.iso.datetime(),
  customer: z.object({
    firstName: z.string(),
    lastName: z.string().optional(),
    email: z.string(),
    phone: z.string(),
    note: z.string().optional(),
    marketingConsent: z.boolean(),
  }),
  /** Champ piège invisible : rempli seulement par les robots. */
  website: z.string().max(0).optional(),
});

export type BookingConfirmation = {
  status: "confirmed" | "pending_payment";
  startsAt: string;
  endsAt: string;
  staffName: string;
  totalCents: number;
  depositCents: number;
  currency: string;
  manageToken: string;
  holdExpiresAt: string | null;
};

export async function bookAction(raw: z.input<typeof bookInput>): Promise<PublicResult<BookingConfirmation>> {
  return run(async () => {
    const input = bookInput.parse(raw);
    const site = await currentSiteTenant();
    if (!publicLimits.booking.attempt(site.ip)) throw new AppError("rate_limited");
    return withTenant(site.tenantId, async (tx) => {
      const result = await createBooking(
        tx,
        site.tenantId,
        {
          serviceIds: input.serviceIds,
          staffId: input.staffId,
          start: input.start,
          customer: input.customer,
        },
        { allowDraft: site.preview },
      );
      const context = await loadBookingContext(tx, site.tenantId);
      return {
        status: result.status as BookingConfirmation["status"],
        startsAt: result.startsAt.toISOString(),
        endsAt: result.endsAt.toISOString(),
        staffName: context.staff.find((member) => member.id === result.staffId)?.name ?? "",
        totalCents: result.totalCents,
        depositCents: result.depositCents,
        currency: result.currency,
        manageToken: result.manageToken,
        holdExpiresAt: result.holdExpiresAt?.toISOString() ?? null,
      };
    });
  });
}

export async function cancelAction(token: string): Promise<PublicResult<{ cancelled: true }>> {
  return run(async () => {
    const site = await currentSiteTenant();
    if (!publicLimits.manage.attempt(site.ip)) throw new AppError("rate_limited");
    await withTenant(site.tenantId, (tx) =>
      cancelByCustomer(tx, site.tenantId, z.string().max(80).parse(token)),
    );
    return { cancelled: true as const };
  });
}

const rescheduleInput = z.object({
  token: z.string().max(80),
  start: z.iso.datetime(),
  staffId: z.uuid().nullable(),
});

export async function rescheduleAction(
  raw: z.input<typeof rescheduleInput>,
): Promise<PublicResult<{ manageToken: string; startsAt: string }>> {
  return run(async () => {
    const input = rescheduleInput.parse(raw);
    const site = await currentSiteTenant();
    if (!publicLimits.manage.attempt(site.ip)) throw new AppError("rate_limited");
    const result = await withTenant(site.tenantId, (tx) =>
      rescheduleByCustomer(tx, site.tenantId, input.token, {
        start: new Date(input.start),
        staffId: input.staffId,
      }),
    );
    return { manageToken: result.manageToken, startsAt: result.startsAt.toISOString() };
  });
}
