import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers, services, staffServices, tenants } from "@/db/schema";
import { assignManageToken } from "@/modules/booking/create";
import { computeTotals } from "@/modules/booking/pricing";
import { addMinutes } from "@/modules/booking/time";
import { AppError } from "@/modules/errors";
import { queueBookingConfirmed, queueMessage } from "@/modules/messages/queue";
import type { PaymentGateway } from "@/modules/payments/gateway";
import { refundDeposit } from "@/modules/payments/refunds";
import { normalizePhone } from "@/modules/phone";

/**
 * Actions de la gérante sur les rendez-vous. Contrairement à la réservation en
 * ligne, elle peut placer un rendez-vous hors des créneaux proposés ; seule la
 * règle « pas deux rendez-vous en même temps pour un membre » est imposée (par la base).
 */

async function loadAppointment(tx: Transaction, tenantId: string, appointmentId: string) {
  const [row] = await tx
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.tenantId, tenantId)));
  if (!row) throw new AppError("not_found");
  return row;
}

function slotTaken(error: unknown): never {
  const err = error as { code?: string; cause?: { code?: string } };
  if ((err.code ?? err.cause?.code) === "23P01") throw new AppError("slot_unavailable", "start");
  throw error;
}

/** Venue ou absente (seulement pour un rendez-vous confirmé ou déjà marqué). */
export async function setAttendance(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  status: "attended" | "no_show" | "confirmed",
) {
  const appointment = await loadAppointment(tx, tenantId, appointmentId);
  if (!["confirmed", "attended", "no_show"].includes(appointment.status))
    throw new AppError("booking_not_modifiable");
  await tx.update(appointments).set({ status }).where(eq(appointments.id, appointment.id));
  return { before: appointment.status, after: status };
}

/** Annulation par la gérante : elle choisit à chaque fois de rembourser l'acompte ou non (décision n° 11). */
export async function cancelByManager(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  reason?: string,
  payment: { refund: boolean; gateway: PaymentGateway | null } = { refund: false, gateway: null },
) {
  const appointment = await loadAppointment(tx, tenantId, appointmentId);
  if (!["confirmed", "pending_payment"].includes(appointment.status))
    throw new AppError("booking_not_modifiable");
  await tx
    .update(appointments)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: "manager",
      cancellationReason: reason?.slice(0, 300) || null,
    })
    .where(eq(appointments.id, appointment.id));
  const refund = payment.refund
    ? await refundDeposit(tx, tenantId, appointment.id, payment.gateway, { reason: "manager_cancelled" })
    : null;
  await queueMessage(tx, {
    tenantId,
    template: "customer.cancelled",
    appointmentId: appointment.id,
    locale: appointment.locale,
    data: { by: "establishment", refundedCents: refund?.amountCents ?? 0 },
  });
  return { depositCents: appointment.depositCents, refundedCents: refund?.amountCents ?? 0 };
}

async function assertStaffDoesServices(
  tx: Transaction,
  tenantId: string,
  staffId: string,
  serviceIds: string[],
) {
  if (serviceIds.length === 0) return;
  const links = await tx
    .select({ serviceId: staffServices.serviceId })
    .from(staffServices)
    .where(
      and(
        eq(staffServices.tenantId, tenantId),
        eq(staffServices.staffId, staffId),
        inArray(staffServices.serviceId, serviceIds),
      ),
    );
  if (links.length !== new Set(serviceIds).size) throw new AppError("slot_unavailable", "staffId");
}

/** Déplace un rendez-vous (autre horaire et/ou autre membre), même durée. */
export async function moveAppointment(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  target: { start: Date; staffId: string },
) {
  const appointment = await loadAppointment(tx, tenantId, appointmentId);
  if (appointment.status !== "confirmed") throw new AppError("booking_not_modifiable");
  const items = await tx
    .select({ serviceId: appointmentItems.serviceId })
    .from(appointmentItems)
    .where(eq(appointmentItems.appointmentId, appointment.id));
  await assertStaffDoesServices(
    tx,
    tenantId,
    target.staffId,
    items.map((item) => item.serviceId).filter((id): id is string => Boolean(id)),
  );
  const duration = appointment.endsAt.getTime() - appointment.startsAt.getTime();
  const buffer = appointment.blockedUntil.getTime() - appointment.endsAt.getTime();
  try {
    await tx
      .update(appointments)
      .set({
        staffId: target.staffId,
        startsAt: target.start,
        endsAt: new Date(target.start.getTime() + duration),
        blockedUntil: new Date(target.start.getTime() + duration + buffer),
      })
      .where(eq(appointments.id, appointment.id));
  } catch (error) {
    slotTaken(error);
  }
  // Seul un changement d'horaire est signalé à la cliente (pas un simple changement de membre).
  if (appointment.startsAt.getTime() !== target.start.getTime()) {
    await queueMessage(tx, {
      tenantId,
      template: "customer.moved",
      appointmentId: appointment.id,
      locale: appointment.locale,
      data: { previousStartsAt: appointment.startsAt.toISOString() },
      // Plusieurs déplacements possibles : un message par nouvel horaire.
      dedupeKey: `customer.moved:${appointment.id}:${target.start.toISOString()}`,
    });
  }
  return { from: appointment.startsAt, to: target.start };
}

export const manualAppointmentInput = z.object({
  serviceIds: z.array(z.uuid()).min(1).max(10),
  staffId: z.uuid(),
  start: z.coerce.date(),
  customerId: z.uuid().optional(),
  newCustomer: z
    .object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().max(80).optional(),
      phone: z.string().trim().max(40).optional(),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .optional()
        .transform((value) => value || undefined)
        .pipe(z.email().optional()),
    })
    .optional(),
  internalNote: z.string().trim().max(500).optional(),
});

/**
 * Rendez-vous ajouté à la main par la gérante (téléphone, passage) :
 * toutes les prestations sont possibles, il ne compte pas dans le quota Basic.
 */
export async function createManualAppointment(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof manualAppointmentInput>,
) {
  const input = manualAppointmentInput.parse(raw);
  const [tenant] = await tx
    .select({ country: tenants.country, locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const chosen = await tx
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), inArray(services.id, input.serviceIds)));
  if (chosen.length !== new Set(input.serviceIds).size)
    throw new AppError("service_unavailable", "serviceIds");
  const ordered = input.serviceIds.map((id) => chosen.find((service) => service.id === id)!);
  await assertStaffDoesServices(tx, tenantId, input.staffId, input.serviceIds);
  const totals = computeTotals(ordered);

  let customerId = input.customerId;
  if (customerId) {
    const [existing] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
    if (!existing) throw new AppError("not_found", "customerId");
  } else {
    if (!input.newCustomer) throw new AppError("invalid", "customer");
    const phone = normalizePhone(input.newCustomer.phone, tenant.country, "phone");
    if (!phone && !input.newCustomer.email) throw new AppError("invalid", "phone");
    const [existing] = input.newCustomer.email
      ? await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              sql`lower(${customers.email}) = ${input.newCustomer.email}`,
            ),
          )
      : [];
    customerId =
      existing?.id ??
      (
        await tx
          .insert(customers)
          .values({
            tenantId,
            firstName: input.newCustomer.firstName,
            lastName: input.newCustomer.lastName || null,
            phone,
            email: input.newCustomer.email ?? null,
            locale: tenant.locale,
          })
          .returning({ id: customers.id })
      )[0].id;
  }

  const endsAt = addMinutes(input.start, totals.durationMinutes);
  let created;
  try {
    [created] = await tx
      .insert(appointments)
      .values({
        tenantId,
        customerId,
        staffId: input.staffId,
        startsAt: input.start,
        endsAt,
        blockedUntil: addMinutes(endsAt, totals.bufferMinutes),
        status: "confirmed",
        source: "manual",
        totalCents: totals.totalCents,
        currency: totals.currency,
        locale: tenant.locale,
        internalNote: input.internalNote || null,
      })
      .returning();
  } catch (error) {
    slotTaken(error);
  }
  await assignManageToken(tx, created!.id);
  await queueBookingConfirmed(tx, tenantId, created!);
  await tx.insert(appointmentItems).values(
    ordered.map((service, index) => ({
      tenantId,
      appointmentId: created!.id,
      serviceId: service.id,
      position: index + 1,
      serviceName: service.name,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      priceCents: service.priceCents,
    })),
  );
  return { appointmentId: created!.id, customerId };
}

export async function updateInternalNote(
  tx: Transaction,
  tenantId: string,
  appointmentId: string,
  note: string,
) {
  const appointment = await loadAppointment(tx, tenantId, appointmentId);
  await tx
    .update(appointments)
    .set({ internalNote: note.trim().slice(0, 500) || null })
    .where(eq(appointments.id, appointment.id));
}
