import { assertQuota } from "@/modules/quotas";
import { createHash, createHmac, hkdfSync } from "node:crypto";
import { and, eq, lte, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { authSecret } from "@/config/env";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers, usageCounters } from "@/db/schema";
import { checkGiftCard, redeemForBooking } from "@/modules/giftcards/giftcards";
import { AppError } from "@/modules/errors";
import { createDepositIntent, onlinePaymentReady } from "@/modules/payments/deposits";
import type { PaymentGateway } from "@/modules/payments/gateway";
import { queueBookingConfirmed, queueMessage } from "@/modules/messages/queue";
import { isValidBirthday } from "@/modules/customers/birthday";
import { normalizePhone } from "@/modules/phone";
import { redeemPromo } from "@/modules/promo/codes";
import { currentPeriod } from "@/modules/tenants/queries";
import {
  bookedMinutesOn,
  getSlotsForRange,
  loadBookingContext,
  resolveServices,
  type BookingContext,
} from "./availability";
import { computeDeposit } from "./pricing";
import { chooseLeastLoaded } from "./slots";
import { adjustHoldUsage } from "./holds";
import { addMinutes, utcToLocal } from "./time";

/**
 * Création d'un rendez-vous (réservation en ligne par une cliente, ou ajout
 * manuel par la gérante). Tout se passe dans une seule transaction : si une
 * étape échoue, rien n'est enregistré (ni rendez-vous, ni compteur du mois).
 */

export const customerInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.email().trim().toLowerCase(),
  phone: z.string().trim().min(6).max(40),
  note: z.string().trim().max(500).optional(),
  /** Prénom de la personne qui reçoit le soin, si ce n'est pas la cliente qui réserve. */
  beneficiaryName: z.string().trim().max(80).optional(),
  marketingConsent: z.boolean().default(false),
  /** Anniversaire facultatif (jour et mois), proposé si l'entreprise a l'offre d'anniversaire. */
  birthMonth: z.number().int().min(1).max(12).nullish(),
  birthDay: z.number().int().min(1).max(31).nullish(),
});

export const bookingInput = z.object({
  serviceIds: z.array(z.uuid()).min(1).max(10),
  /** null : « sans préférence ». */
  staffId: z.uuid().nullable(),
  start: z.coerce.date(),
  customer: customerInput,
  locale: z.string().min(2).max(5).default("fr"),
  /** Code promo saisi par la cliente (réservation en ligne uniquement). */
  promoCode: z.string().trim().max(30).optional(),
  /** Carte cadeau : remplace l'acompte (débité de la carte). */
  giftCardCode: z.string().trim().max(40).optional(),
});

export type BookingInput = z.input<typeof bookingInput>;

export type BookingOptions = {
  now?: Date;
  source?: "online" | "manual";
  /** Aperçu admin d'un site en création : la réservation est permise. */
  allowDraft?: boolean;
  /** Prestataire de paiement (acompte en ligne). Sans lui, aucun acompte n'est demandé. */
  gateway?: PaymentGateway | null;
};

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Lien personnel « annuler / déplacer » d'un rendez-vous : calculé à partir de
 * son identifiant et de la clé secrète du serveur. Il peut ainsi être remis dans
 * chaque e-mail ou SMS sans jamais être stocké en clair (seule son empreinte l'est).
 */
export function manageTokenFor(appointmentId: string): string {
  const key = Buffer.from(hkdfSync("sha256", authSecret(), "appointment-manage-link", "v1", 32));
  return createHmac("sha256", key).update(appointmentId).digest("base64url").slice(0, 32);
}

/** Enregistre l'empreinte du lien d'un rendez-vous qui vient d'être créé, et renvoie le lien. */
export async function assignManageToken(tx: Transaction, appointmentId: string): Promise<string> {
  const token = manageTokenFor(appointmentId);
  await tx
    .update(appointments)
    .set({ manageTokenHash: hashManageToken(token) })
    .where(eq(appointments.id, appointmentId));
  return token;
}

/**
 * Libère les réservations temporaires (paiement non abouti) dont le délai est passé.
 * Le code promo et la réservation du mois qu'elles avaient comptés sont rendus.
 */
export async function expireStaleHolds(tx: Transaction, tenantId: string, now: Date) {
  const expired = await tx
    .update(appointments)
    .set({ status: "expired" })
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.status, "pending_payment"),
        lte(appointments.holdExpiresAt, now),
      ),
    )
    .returning({
      promoCodeId: appointments.promoCodeId,
      createdAt: appointments.createdAt,
      source: appointments.source,
    });
  await adjustHoldUsage(tx, tenantId, expired, "release", now);
}

/**
 * Consomme une réservation du quota mensuel (pack Basic), de façon atomique :
 * deux réservations simultanées ne peuvent pas dépasser la limite.
 * Renvoie le nombre de réservations du mois après celle-ci (null si pas de limite),
 * ou false si la limite est atteinte.
 */
export async function consumeOnlineQuota(
  tx: Transaction,
  context: BookingContext,
  now: Date,
): Promise<{ used: number; limit: number; period: string } | null | false> {
  const limit = context.limits.onlineBookingsPerMonth;
  const period = currentPeriod(context.tenant.timezone, now);
  // Sans limite, la réservation est quand même comptée (suivi du mois, changement de pack).
  if (limit === null || limit === undefined) {
    await tx
      .insert(usageCounters)
      .values({ tenantId: context.tenant.id, period, onlineBookings: 1 })
      .onConflictDoUpdate({
        target: [usageCounters.tenantId, usageCounters.period],
        set: { onlineBookings: sql`${usageCounters.onlineBookings} + 1`, updatedAt: now },
      });
    return null;
  }
  if (limit <= 0) return false;
  const rows = await tx
    .insert(usageCounters)
    .values({ tenantId: context.tenant.id, period, onlineBookings: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.tenantId, usageCounters.period],
      set: { onlineBookings: sql`${usageCounters.onlineBookings} + 1`, updatedAt: now },
      setWhere: sql`${usageCounters.onlineBookings} < ${limit}`,
    })
    .returning({ value: usageCounters.onlineBookings });
  return rows.length > 0 ? { used: rows[0].value, limit, period } : false;
}

/**
 * Retrouve ou crée la fiche cliente (même e-mail chez un même établissement = même fiche).
 * En ligne, n'importe qui peut saisir l'e-mail d'une autre : une fiche existante n'est
 * donc jamais modifiée sur ce qui compte (seul un nom de famille manquant est ajouté).
 * Ni téléphone (un inconnu pourrait y mettre son numéro et se connecter par SMS à
 * l'espace de la cliente), ni accord pour les offres (seule la cliente peut le donner).
 * La gérante, elle, met la fiche à jour.
 */
async function upsertCustomer(
  tx: Transaction,
  context: BookingContext,
  input: z.infer<typeof customerInput>,
  locale: string,
  now: Date,
  source: "online" | "manual",
) {
  const phone = normalizePhone(input.phone, context.tenant.country, "phone");
  const [existing] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, context.tenant.id), sql`lower(${customers.email}) = ${input.email}`));
  const consent = input.marketingConsent ? { emailConsent: true, smsConsent: true, consentAt: now } : {};
  // Anniversaire saisi : les deux ou rien, une date qui existe. En ligne, il n'est demandé (et
  // gardé) que si l'entreprise propose l'offre d'anniversaire : rien de plus que nécessaire.
  const wanted =
    source === "manual" || (context.settings.birthdayOfferEnabled && Boolean(context.features.promoCodes));
  const given = input.birthMonth != null || input.birthDay != null;
  if (wanted && given && !isValidBirthday(input.birthMonth ?? 0, input.birthDay ?? 0))
    throw new AppError("invalid", "customer.birthDay");
  const birthday =
    wanted && given ? { birthMonth: input.birthMonth as number, birthDay: input.birthDay as number } : null;
  if (existing) {
    await tx
      .update(customers)
      .set(
        source === "online"
          ? {
              // Écrit même sans changement : verrouille la fiche (code promo « une fois par cliente »).
              lastName: existing.lastName ?? (input.lastName || null),
              // Comme le téléphone : en ligne, l'anniversaire n'est jamais remplacé (n'importe qui
              // peut saisir l'e-mail d'une autre et changer la date de son offre). Seulement ajouté s'il manque.
              ...(birthday && existing.birthMonth === null ? birthday : {}),
            }
          : {
              firstName: input.firstName,
              lastName: input.lastName || existing.lastName,
              phone,
              locale,
              ...consent,
              ...(birthday ?? {}),
            },
      )
      .where(eq(customers.id, existing.id));
    return existing.id;
  }
  // Nombre de fiches clients limité par le pack (ex. Basic) : au-delà, la cliente est invitée à appeler.
  await assertQuota(tx, context.tenant.id, "customers").catch((error) => {
    throw error instanceof AppError && error.code === "quota_reached"
      ? new AppError("booking_quota_reached")
      : error;
  });
  // Deux réservations simultanées avec une même nouvelle adresse : la seconde reprend la fiche créée.
  const created = await tx
    .insert(customers)
    .values({
      tenantId: context.tenant.id,
      firstName: input.firstName,
      lastName: input.lastName || null,
      email: input.email,
      phone,
      locale,
      ...consent,
      ...(birthday ?? {}),
    })
    .onConflictDoNothing()
    .returning({ id: customers.id });
  if (created[0]) return created[0].id;
  const [concurrent] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, context.tenant.id), sql`lower(${customers.email}) = ${input.email}`))
    .for("update");
  if (!concurrent) throw new AppError("slot_unavailable", "start");
  return concurrent.id;
}

/** Code promo limité à une utilisation par cliente (rendez-vous annulés ou expirés exclus). */
async function assertPromoUnusedBy(
  tx: Transaction,
  tenantId: string,
  promoCodeId: string,
  customerId: string,
) {
  const [used] = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.customerId, customerId),
        eq(appointments.promoCodeId, promoCodeId),
        notInArray(appointments.status, ["cancelled", "expired"]),
      ),
    )
    .limit(1);
  if (used) throw new AppError("promo_code_already_used", "promoCode");
}

function isExclusionViolation(error: unknown) {
  const err = error as { code?: string; cause?: { code?: string } };
  return (err.code ?? err.cause?.code) === "23P01";
}

export async function createBooking(
  tx: Transaction,
  tenantId: string,
  raw: BookingInput,
  options: BookingOptions = {},
) {
  const now = options.now ?? new Date();
  const source = options.source ?? "online";
  const input = bookingInput.parse(raw);
  const context = await loadBookingContext(tx, tenantId);
  const status = context.tenant.status;
  if (!(status === "active" || (options.allowDraft && status === "draft")))
    throw new AppError("booking_closed");
  // Réservation en ligne coupée par l'entreprise : la gérante peut toujours noter un rendez-vous.
  if (source === "online" && !context.settings.onlineBookingEnabled) throw new AppError("booking_closed");

  const { services, totals } = resolveServices(context, input.serviceIds, {
    onlineOnly: source === "online",
  });
  const paymentReady =
    source === "online" && onlinePaymentReady(context.business, context.features, options.gateway);

  await expireStaleHolds(tx, tenantId, now);

  // Le créneau est recalculé ici : on ne fait jamais confiance à l'écran.
  const date = utcToLocal(input.start, context.tenant.timezone).date;
  const slots =
    (
      await getSlotsForRange(tx, context, {
        serviceIds: input.serviceIds,
        staffId: input.staffId,
        fromDate: date,
        days: 1,
        now,
        onlineOnly: source === "online",
      })
    ).get(date) ?? [];
  const slot = slots.find((item) => item.start.getTime() === input.start.getTime());
  if (!slot) throw new AppError("slot_unavailable", "start");
  const staffId =
    input.staffId ??
    chooseLeastLoaded(slot.staffIds, context.staff, await bookedMinutesOn(tx, context, date, now));
  if (!staffId || !slot.staffIds.includes(staffId)) throw new AppError("slot_unavailable", "start");

  const quota = source === "online" ? await consumeOnlineQuota(tx, context, now) : null;
  if (quota === false) throw new AppError("booking_quota_reached");

  // Pas de cumul : un code promo ne s'ajoute pas à une promotion en cours.
  if (source === "online" && input.promoCode && services.some((service) => service.promotion)) {
    throw new AppError("promo_not_combinable", "promoCode");
  }
  // Code promo : réduction sur le total, puis acompte calculé sur le total réduit (décision n° 8).
  const promo =
    source === "online" && input.promoCode
      ? await redeemPromo(tx, tenantId, input.promoCode, totals.totalCents, now)
      : null;
  const discountCents = promo?.discountCents ?? 0;
  const totalCents = totals.totalCents - discountCents;
  const depositCents = computeDeposit(totalCents, context.settings, paymentReady);
  // Carte cadeau : vérifiée avant tout, débitée une fois le rendez-vous créé. Une carte déjà
  // vendue reste valable même si le pack ne permet plus d'en vendre ; un code inconnu est refusé.
  const giftCardCode = source === "online" && input.giftCardCode ? input.giftCardCode : null;
  if (giftCardCode) await checkGiftCard(tx, tenantId, giftCardCode, depositCents, now);

  const customerId = await upsertCustomer(tx, context, input.customer, input.locale, now, source);
  if (promo) {
    // Code personnel (ex. anniversaire) : réservé à sa cliente, refusé pour toute autre fiche.
    if (promo.customerId && promo.customerId !== customerId)
      throw new AppError("promo_code_invalid", "promoCode");
    await assertPromoUnusedBy(tx, tenantId, promo.promoCodeId, customerId);
  }
  const endsAt = addMinutes(input.start, totals.durationMinutes);
  const pending = depositCents > 0 && !giftCardCode;

  let appointment;
  try {
    [appointment] = await tx
      .insert(appointments)
      .values({
        tenantId,
        customerId,
        staffId,
        startsAt: input.start,
        endsAt,
        blockedUntil: addMinutes(endsAt, totals.bufferMinutes),
        status: pending ? "pending_payment" : "confirmed",
        source,
        holdExpiresAt: pending ? addMinutes(now, context.settings.holdMinutes) : null,
        totalCents,
        discountCents,
        depositCents,
        currency: totals.currency,
        promoCodeId: promo?.promoCodeId ?? null,
        locale: input.locale,
        customerNote: input.customer.note || null,
        beneficiaryName: input.customer.beneficiaryName || null,
      })
      .returning();
  } catch (error) {
    // Deux réservations au même moment : la base n'en accepte qu'une.
    if (isExclusionViolation(error)) throw new AppError("slot_unavailable", "start");
    throw error;
  }

  const manageToken = await assignManageToken(tx, appointment.id);
  if (giftCardCode) await redeemForBooking(tx, tenantId, giftCardCode, appointment.id, depositCents, now);
  await tx.insert(appointmentItems).values(
    services.map((service, index) => ({
      tenantId,
      appointmentId: appointment.id,
      serviceId: service.id,
      position: index + 1,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      priceCents: service.priceCents,
    })),
  );

  let payment: { clientSecret: string; accountId: string; publishableKey: string } | null = null;
  if (pending && options.gateway && context.business.stripeAccountId) {
    const intent = await createDepositIntent(
      tx,
      tenantId,
      {
        appointmentId: appointment.id,
        amountCents: depositCents,
        currency: totals.currency,
        accountId: context.business.stripeAccountId,
        receiptEmail: input.customer.email,
      },
      options.gateway,
    );
    if (!intent.clientSecret) throw new AppError("payment_provider_error");
    payment = {
      clientSecret: intent.clientSecret,
      accountId: context.business.stripeAccountId,
      publishableKey: options.gateway.publishableKey,
    };
  }

  if (appointment.status === "confirmed") {
    await queueBookingConfirmed(tx, tenantId, appointment);
  }
  // Pack limité : la gérante est prévenue à l'avant-dernière et à la dernière réservation du mois.
  if (quota && quota.used >= quota.limit - 1) {
    await queueMessage(tx, {
      tenantId,
      template: "manager.basic_quota",
      appointmentId: appointment.id,
      data: { used: quota.used, limit: quota.limit },
      dedupeKey: `manager.basic_quota:${tenantId}:${quota.period}:${quota.used}`,
    });
  }

  return {
    payment,
    discountCents,
    appointmentId: appointment.id,
    manageToken,
    status: appointment.status,
    staffId,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    totalCents: appointment.totalCents,
    depositCents: appointment.depositCents,
    /** Acompte réglé avec une carte cadeau. */
    paidWithGiftCard: Boolean(giftCardCode) && appointment.depositCents > 0,
    currency: appointment.currency,
    holdExpiresAt: appointment.holdExpiresAt,
  };
}
