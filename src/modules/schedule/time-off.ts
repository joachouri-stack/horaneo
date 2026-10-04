import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { appointments, staffMembers, tenants, timeOff } from "@/db/schema";
import { addDays, DATE_PATTERN, localToUtc } from "@/modules/booking/time";
import { AppError } from "@/modules/errors";

/**
 * Indisponibilités saisies par la gérante :
 * - « block » : un créneau bloqué pour un membre (ex. 14 h-15 h) ;
 * - « leave » : un congé d'un membre, sur un ou plusieurs jours ;
 * - « closure » : une fermeture de tout l'établissement (jour(s) entier(s)).
 * Les rendez-vous déjà pris ne sont pas supprimés : ils sont signalés.
 */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const timeOffInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("block"),
    staffId: z.uuid(),
    date: z.string().regex(DATE_PATTERN),
    from: z.string().regex(TIME),
    to: z.string().regex(TIME),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    kind: z.literal("leave"),
    staffId: z.uuid(),
    startDate: z.string().regex(DATE_PATTERN),
    endDate: z.string().regex(DATE_PATTERN),
    reason: z.string().trim().max(200).optional(),
  }),
  z.object({
    kind: z.literal("closure"),
    startDate: z.string().regex(DATE_PATTERN),
    endDate: z.string().regex(DATE_PATTERN),
    reason: z.string().trim().max(200).optional(),
  }),
]);

export async function createTimeOff(tx: Transaction, tenantId: string, raw: z.input<typeof timeOffInput>) {
  const input = timeOffInput.parse(raw);
  const [tenant] = await tx
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const tz = tenant.timezone;
  let startsAt: Date;
  let endsAt: Date;
  if (input.kind === "block") {
    if (input.from >= input.to) throw new AppError("hours_invalid", "to");
    startsAt = localToUtc(input.date, input.from, tz);
    endsAt = localToUtc(input.date, input.to, tz);
  } else {
    if (input.endDate < input.startDate) throw new AppError("hours_invalid", "endDate");
    startsAt = localToUtc(input.startDate, "00:00", tz);
    endsAt = localToUtc(addDays(input.endDate, 1), "00:00", tz);
  }
  const staffId = input.kind === "closure" ? null : input.staffId;
  if (staffId) {
    const [member] = await tx
      .select({ id: staffMembers.id })
      .from(staffMembers)
      .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, tenantId)));
    if (!member) throw new AppError("not_found", "staffId");
  }
  const [created] = await tx
    .insert(timeOff)
    .values({ tenantId, staffId, kind: input.kind, startsAt, endsAt, reason: input.reason || null })
    .returning();
  // Rendez-vous déjà pris sur cette période : à prévenir ou déplacer.
  const conflicts = await tx
    .select({ id: appointments.id, startsAt: appointments.startsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.tenantId, tenantId),
        inArray(appointments.status, ["confirmed", "pending_payment"]),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
        staffId ? eq(appointments.staffId, staffId) : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt));
  return { timeOff: created, conflicts };
}

export async function deleteTimeOff(tx: Transaction, tenantId: string, timeOffId: string) {
  const [deleted] = await tx
    .delete(timeOff)
    .where(and(eq(timeOff.id, timeOffId), eq(timeOff.tenantId, tenantId)))
    .returning();
  if (!deleted) throw new AppError("not_found");
  return deleted;
}

export async function listUpcomingTimeOff(tx: Transaction, tenantId: string, now = new Date()) {
  return tx
    .select({
      id: timeOff.id,
      kind: timeOff.kind,
      staffId: timeOff.staffId,
      staffName: staffMembers.name,
      startsAt: timeOff.startsAt,
      endsAt: timeOff.endsAt,
      reason: timeOff.reason,
    })
    .from(timeOff)
    .leftJoin(staffMembers, eq(staffMembers.id, timeOff.staffId))
    .where(and(eq(timeOff.tenantId, tenantId), gt(timeOff.endsAt, now)))
    .orderBy(asc(timeOff.startsAt))
    .limit(100);
}
