import { and, asc, eq } from "drizzle-orm";
import type { Transaction } from "@/db/client";
import { staffMembers, staffSchedules } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { openingHoursInput, validateRanges } from "@/modules/schedule/opening-hours";

/** Horaires de travail hebdomadaires d'un membre (plusieurs plages par jour). */

export async function listStaffSchedules(tx: Transaction, tenantId: string, staffId: string) {
  return tx
    .select()
    .from(staffSchedules)
    .where(and(eq(staffSchedules.tenantId, tenantId), eq(staffSchedules.staffId, staffId)))
    .orderBy(asc(staffSchedules.weekday), asc(staffSchedules.startsAt));
}

export async function replaceStaffSchedules(
  tx: Transaction,
  tenantId: string,
  staffId: string,
  raw: unknown,
) {
  const ranges = openingHoursInput.parse(raw);
  validateRanges(ranges);
  const [member] = await tx
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, tenantId)));
  if (!member) throw new AppError("not_found");
  await tx
    .delete(staffSchedules)
    .where(and(eq(staffSchedules.tenantId, tenantId), eq(staffSchedules.staffId, staffId)));
  if (ranges.length > 0) {
    await tx.insert(staffSchedules).values(
      ranges.map((range) => ({
        tenantId,
        staffId,
        weekday: range.weekday,
        startsAt: range.opensAt,
        endsAt: range.closesAt,
      })),
    );
  }
  return ranges;
}
