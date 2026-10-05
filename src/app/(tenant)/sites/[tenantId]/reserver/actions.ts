"use server";

import { z } from "zod";
import type { Transaction } from "@/db/client";
import { sendQueuedSoon } from "@/lib/jobs/tick";
import { paymentGateway } from "@/lib/payments/stripe";
import { withServicesBusiness, withTokenBusiness } from "@/lib/site/business";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import {
  getSlotsForRange,
  isOnlineQuotaReached,
  loadBookingContext,
  resolveServices,
} from "@/modules/booking/availability";
import { createBooking } from "@/modules/booking/create";
import { cancelByCustomer, findByManageToken, rescheduleByCustomer } from "@/modules/booking/manage";
import { addDays, DATE_PATTERN, utcToLocal } from "@/modules/booking/time";
import { computeDeposit } from "@/modules/booking/pricing";
import { AppError, type AppErrorCode } from "@/modules/errors";
import { onlinePaymentReady, syncDeposit } from "@/modules/payments/deposits";
import { previewPromo } from "@/modules/promo/codes";
import { checkGiftCard } from "@/modules/giftcards/giftcards";

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
    const scoped = <T>(fn: (tx: Transaction) => Promise<T>) =>
      input.manageToken
        ? withTokenBusiness(site.tenantId, input.manageToken, fn)
        : withServicesBusiness(site.tenantId, input.serviceIds, fn);
    return scoped(async (tx) => {
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
      } else if (!context.settings.onlineBookingEnabled) {
        throw new AppError("booking_closed");
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
  promoCode: z.string().max(30).optional(),
  giftCardCode: z.string().max(40).optional(),
  /** Champ piège invisible : rempli seulement par les robots. */
  website: z.string().max(0).optional(),
});

export type BookingConfirmation = {
  status: "confirmed" | "pending_payment";
  startsAt: string;
  endsAt: string;
  staffName: string;
  totalCents: number;
  discountCents: number;
  depositCents: number;
  paidWithGiftCard: boolean;
  currency: string;
  manageToken: string;
  holdExpiresAt: string | null;
  /** Formulaire de carte Stripe (acompte), sur le compte du professionnel. */
  payment: { clientSecret: string; accountId: string; publishableKey: string } | null;
};

export async function bookAction(raw: z.input<typeof bookInput>): Promise<PublicResult<BookingConfirmation>> {
  return run(async () => {
    const input = bookInput.parse(raw);
    const site = await currentSiteTenant();
    if (!publicLimits.booking.attempt(site.ip)) throw new AppError("rate_limited");
    return withServicesBusiness(site.tenantId, input.serviceIds, async (tx) => {
      const result = await createBooking(
        tx,
        site.tenantId,
        {
          serviceIds: input.serviceIds,
          staffId: input.staffId,
          start: input.start,
          customer: input.customer,
          promoCode: input.promoCode || undefined,
          giftCardCode: input.giftCardCode || undefined,
        },
        { allowDraft: site.preview, gateway: paymentGateway() },
      );
      const context = await loadBookingContext(tx, site.tenantId);
      sendQueuedSoon();
      return {
        status: result.status as BookingConfirmation["status"],
        startsAt: result.startsAt.toISOString(),
        endsAt: result.endsAt.toISOString(),
        staffName: context.staff.find((member) => member.id === result.staffId)?.name ?? "",
        totalCents: result.totalCents,
        discountCents: result.discountCents,
        depositCents: result.depositCents,
        paidWithGiftCard: result.paidWithGiftCard,
        currency: result.currency,
        manageToken: result.manageToken,
        holdExpiresAt: result.holdExpiresAt?.toISOString() ?? null,
        payment: result.payment,
      };
    });
  });
}

const promoInput = z.object({
  code: z.string().trim().min(1).max(30),
  serviceIds: z.array(z.uuid()).min(1).max(10),
});

export type PromoPreview = { code: string; totalCents: number; discountCents: number; depositCents: number };

/** Vérifie un code promo avant la réservation (le code n'est consommé qu'à la réservation). */
export async function checkPromoAction(raw: z.input<typeof promoInput>): Promise<PublicResult<PromoPreview>> {
  return run(async () => {
    const input = promoInput.parse(raw);
    const site = await currentSiteTenant();
    if (!publicLimits.promo.attempt(site.ip)) throw new AppError("rate_limited");
    return withServicesBusiness(site.tenantId, input.serviceIds, async (tx) => {
      const context = await loadBookingContext(tx, site.tenantId);
      const { services, totals } = resolveServices(context, input.serviceIds);
      if (services.some((service) => service.promotion))
        throw new AppError("promo_not_combinable", "promoCode");
      const promo = await previewPromo(tx, site.tenantId, input.code, totals.totalCents);
      const totalCents = totals.totalCents - promo.discountCents;
      const ready = onlinePaymentReady(context.business, context.features, paymentGateway());
      return {
        code: promo.code,
        totalCents,
        discountCents: promo.discountCents,
        depositCents: computeDeposit(totalCents, context.settings, ready),
      };
    });
  });
}

/** Après le paiement dans le navigateur : relit le paiement chez Stripe et confirme le rendez-vous. */
export async function confirmPaymentAction(
  token: string,
): Promise<PublicResult<{ status: "confirmed" | "pending_payment" | "other" }>> {
  return run(async () => {
    const site = await currentSiteTenant();
    if (!publicLimits.manage.attempt(site.ip)) throw new AppError("rate_limited");
    return withTokenBusiness(site.tenantId, z.string().max(80).parse(token), async (tx) => {
      const managed = await findByManageToken(tx, site.tenantId, token);
      if (!managed) throw new AppError("not_found");
      await syncDeposit(tx, site.tenantId, managed.appointment.id, paymentGateway());
      const after = await findByManageToken(tx, site.tenantId, token);
      sendQueuedSoon();
      const status = after?.appointment.status;
      return { status: status === "confirmed" || status === "pending_payment" ? status : "other" };
    });
  });
}

export async function cancelAction(
  token: string,
): Promise<PublicResult<{ cancelled: true; refundedCents: number; currency: string }>> {
  return run(async () => {
    const site = await currentSiteTenant();
    if (!publicLimits.manage.attempt(site.ip)) throw new AppError("rate_limited");
    const parsed = z.string().max(80).parse(token);
    const result = await withTokenBusiness(site.tenantId, parsed, async (tx) => {
      const cancelled = await cancelByCustomer(tx, site.tenantId, parsed, new Date(), paymentGateway());
      const context = await loadBookingContext(tx, site.tenantId);
      return { ...cancelled, currency: context.tenant.currency };
    });
    sendQueuedSoon();
    return { cancelled: true as const, refundedCents: result.refundedCents, currency: result.currency };
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
    const result = await withTokenBusiness(site.tenantId, input.token, (tx) =>
      rescheduleByCustomer(tx, site.tenantId, input.token, {
        start: new Date(input.start),
        staffId: input.staffId,
      }),
    );
    sendQueuedSoon();
    return { manageToken: result.manageToken, startsAt: result.startsAt.toISOString() };
  });
}

const giftInput = z.object({
  code: z.string().trim().min(4).max(40),
  serviceIds: z.array(z.uuid()).min(1).max(10),
  promoCode: z.string().max(30).optional(),
});

export type GiftPreview = { last4: string; balanceCents: number; depositCents: number; currency: string };

/** Vérifie une carte cadeau avant la réservation (rien n'est débité avant la confirmation). */
export async function checkGiftCardAction(
  raw: z.input<typeof giftInput>,
): Promise<PublicResult<GiftPreview>> {
  return run(async () => {
    const input = giftInput.parse(raw);
    const site = await currentSiteTenant();
    // Mêmes limites que les codes promo : empêche de deviner des codes.
    if (!publicLimits.promo.attempt(site.ip)) throw new AppError("rate_limited");
    return withServicesBusiness(site.tenantId, input.serviceIds, async (tx) => {
      const context = await loadBookingContext(tx, site.tenantId);
      if (!context.features.giftCards) throw new AppError("gift_card_not_found", "giftCardCode");
      const { totals } = resolveServices(context, input.serviceIds);
      const ready = onlinePaymentReady(context.business, context.features, paymentGateway());
      const promo = input.promoCode
        ? await previewPromo(tx, site.tenantId, input.promoCode, totals.totalCents)
        : null;
      const depositCents = computeDeposit(
        totals.totalCents - (promo?.discountCents ?? 0),
        context.settings,
        ready,
      );
      const card = await checkGiftCard(tx, site.tenantId, input.code, depositCents);
      return {
        last4: card.codeLast4,
        balanceCents: card.balanceCents,
        depositCents,
        currency: card.currency,
      };
    });
  });
}
