import { and, asc, eq, sql } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, staffMembers } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";
import { creditBackForAppointment, moveGiftCardRedemption } from "@/modules/giftcards/giftcards";
import { queueMessage } from "@/modules/messages/queue";
import { moveDeposit } from "@/modules/payments/deposits";
import type { PaymentGateway } from "@/modules/payments/gateway";
import { refundDeposit } from "@/modules/payments/refunds";
import { getSlotsForRange, loadBookingContext } from "./availability";
import { assignManageToken, hashManageToken } from "./create";
import { addMinutes, utcToLocal } from "./time";

/**
 * Gestion d'un rendez-vous par la cliente, avec le lien reçu (sans compte) :
 * consulter, annuler ou déplacer, gratuitement jusqu'au délai fixé (24 h par défaut).
 */

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/** Le créneau a été pris entre-temps : la base refuse le doublon (code 23P01). */
async function insertOrSlotTaken<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const err = error as { code?: string; cause?: { code?: string } };
    if ((err.code ?? err.cause?.code) === "23P01") throw new AppError("slot_unavailable", "start");
    throw error;
  }
}

/**
 * Entreprise d'un rendez-vous retrouvé par son lien de gestion. Utilisable sans
 * entreprise déclarée (fonction dédiée de la base) : elle sert à déclarer la bonne.
 */
export async function businessOfManageToken(tx: Transaction, tenantId: string, token: string) {
  if (!TOKEN.test(token)) return null;
  const rows = await tx.execute<{ id: string | null }>(
    sql`SELECT app_manage_token_business(${tenantId}::uuid, ${hashManageToken(token)}) AS id`,
  );
  return rows[0]?.id ?? null;
}

export async function findByManageToken(tx: Transaction, tenantId: string, token: string, locale?: Locale) {
  if (!TOKEN.test(token)) return null;
  const [row] = await tx
    .select({ appointment: appointments, staffName: staffMembers.name })
    .from(appointments)
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .where(
      and(eq(appointments.tenantId, tenantId), eq(appointments.manageTokenHash, hashManageToken(token))),
    );
  if (!row) return null;
  const context = await loadBookingContext(tx, tenantId, row.appointment.businessId);
  const items = await tx
    .select()
    .from(appointmentItems)
    .where(eq(appointmentItems.appointmentId, row.appointment.id))
    .orderBy(asc(appointmentItems.position));
  const lang = (locale ?? context.tenant.defaultLocale) as Locale;
  const deadline = addMinutes(row.appointment.startsAt, -context.settings.cancellationDeadlineHours * 60);
  return {
    appointment: row.appointment,
    staffName: row.staffName,
    items: items.map((item) => ({
      serviceId: item.serviceId,
      name: pickLocalized(item.serviceName, lang),
      durationMinutes: item.durationMinutes,
      priceCents: item.priceCents,
    })),
    context,
    deadline,
  };
}

export type ManagedAppointment = NonNullable<Awaited<ReturnType<typeof findByManageToken>>>;

/** Peut-on encore annuler ou déplacer en ligne ? */
export function canModify(managed: ManagedAppointment, now: Date) {
  return managed.appointment.status === "confirmed" && now <= managed.deadline;
}

function assertModifiable(
  managed: ManagedAppointment | null,
  now: Date,
): asserts managed is ManagedAppointment {
  if (!managed) throw new AppError("not_found");
  if (managed.appointment.status !== "confirmed") throw new AppError("booking_not_modifiable");
  if (now > managed.deadline) throw new AppError("cancellation_deadline_passed");
}

/**
 * Annulation par la cliente, dans le délai : l'acompte éventuel est remboursé
 * automatiquement (après le délai, l'annulation en ligne n'est plus possible).
 */
export async function cancelByCustomer(
  tx: Transaction,
  tenantId: string,
  token: string,
  now = new Date(),
  gateway: PaymentGateway | null = null,
) {
  const managed = await findByManageToken(tx, tenantId, token);
  assertModifiable(managed, now);
  await tx
    .update(appointments)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: "customer" })
    .where(eq(appointments.id, managed.appointment.id));
  // Acompte réglé avec une carte cadeau : le montant est remis sur la carte.
  await creditBackForAppointment(tx, tenantId, managed.appointment.id);
  const refund = await refundDeposit(tx, tenantId, managed.appointment.id, gateway, {
    reason: "customer_cancelled",
    now,
  });
  const appointment = managed.appointment;
  await queueMessage(tx, {
    tenantId,
    template: "customer.cancelled",
    appointmentId: appointment.id,
    locale: appointment.locale,
    data: { by: "customer", refundedCents: refund?.amountCents ?? 0 },
  });
  await queueMessage(tx, { tenantId, template: "manager.cancelled", appointmentId: appointment.id });
  return {
    appointmentId: appointment.id,
    depositCents: appointment.depositCents,
    refundedCents: refund?.amountCents ?? 0,
  };
}

/**
 * Déplace le rendez-vous : mêmes prestations, nouveau créneau (même membre ou un
 * autre). L'acompte éventuel est reporté (décision n° 7). Ne consomme pas le quota.
 */
export async function rescheduleByCustomer(
  tx: Transaction,
  tenantId: string,
  token: string,
  target: { start: Date; staffId: string | null },
  now = new Date(),
) {
  const managed = await findByManageToken(tx, tenantId, token);
  assertModifiable(managed, now);
  const old = managed.appointment;
  const serviceIds = managed.items.map((item) => item.serviceId).filter((id): id is string => Boolean(id));
  if (serviceIds.length !== managed.items.length) throw new AppError("booking_not_modifiable");

  const date = utcToLocal(target.start, managed.context.tenant.timezone).date;
  const slots =
    (
      await getSlotsForRange(tx, managed.context, {
        serviceIds,
        staffId: target.staffId,
        fromDate: date,
        days: 1,
        now,
        excludeAppointmentId: old.id,
        onlineOnly: false,
      })
    ).get(date) ?? [];
  const slot = slots.find((item) => item.start.getTime() === target.start.getTime());
  const staffId = target.staffId ?? (slot?.staffIds.includes(old.staffId) ? old.staffId : slot?.staffIds[0]);
  if (!slot || !staffId || !slot.staffIds.includes(staffId)) throw new AppError("slot_unavailable", "start");

  // L'ancien rendez-vous est annulé d'abord : il libère son créneau dans la même transaction.
  await tx
    .update(appointments)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: "customer",
      cancellationReason: "rescheduled",
    })
    .where(eq(appointments.id, old.id));

  const duration = (old.endsAt.getTime() - old.startsAt.getTime()) / 60000;
  const buffer = (old.blockedUntil.getTime() - old.endsAt.getTime()) / 60000;
  const [created] = await insertOrSlotTaken(() =>
    tx
      .insert(appointments)
      .values({
        tenantId,
        customerId: old.customerId,
        staffId,
        startsAt: target.start,
        endsAt: addMinutes(target.start, duration),
        blockedUntil: addMinutes(target.start, duration + buffer),
        status: "confirmed",
        source: old.source,
        totalCents: old.totalCents,
        discountCents: old.discountCents,
        depositCents: old.depositCents,
        currency: old.currency,
        promoCodeId: old.promoCodeId,
        rescheduledFromId: old.id,
        locale: old.locale,
        customerNote: old.customerNote,
        beneficiaryName: old.beneficiaryName,
      })
      .returning(),
  );
  const manageToken = await assignManageToken(tx, created.id);
  await moveDeposit(tx, tenantId, old.id, created.id);
  await moveGiftCardRedemption(tx, tenantId, old.id, created.id);
  const items = await tx.select().from(appointmentItems).where(eq(appointmentItems.appointmentId, old.id));
  await tx.insert(appointmentItems).values(
    items.map((item) => ({
      tenantId: item.tenantId,
      appointmentId: created.id,
      serviceId: item.serviceId,
      position: item.position,
      serviceName: item.serviceName,
      durationMinutes: item.durationMinutes,
      bufferMinutes: item.bufferMinutes,
      priceCents: item.priceCents,
    })),
  );
  await queueMessage(tx, {
    tenantId,
    template: "customer.rescheduled",
    appointmentId: created.id,
    locale: created.locale,
    data: { previousStartsAt: old.startsAt.toISOString() },
  });
  await queueMessage(tx, {
    tenantId,
    template: "manager.rescheduled",
    appointmentId: created.id,
    data: { previousStartsAt: old.startsAt.toISOString() },
  });
  return { appointmentId: created.id, manageToken, startsAt: created.startsAt, staffId };
}
