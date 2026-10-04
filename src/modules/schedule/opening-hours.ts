import { and, asc, eq } from "drizzle-orm";
import { inCurrentBusiness } from "@/db/access";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { openingHours } from "@/db/schema";
import { AppError } from "@/modules/errors";

/** Horaires d'ouverture : plusieurs plages par jour (ex. 9 h-12 h et 14 h-19 h). */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const openingHoursInput = z.array(
  z.object({
    weekday: z.coerce.number().int().min(1).max(7),
    opensAt: z.string().regex(TIME),
    closesAt: z.string().regex(TIME),
  }),
);

export type OpeningRange = z.infer<typeof openingHoursInput>[number];

/** Vérifie les plages : début avant fin, pas de chevauchement dans une même journée. */
export function validateRanges(ranges: OpeningRange[]) {
  for (const range of ranges) {
    if (range.opensAt >= range.closesAt) throw new AppError("hours_invalid", `day-${range.weekday}`);
  }
  for (let day = 1; day <= 7; day++) {
    const sorted = ranges
      .filter((range) => range.weekday === day)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].opensAt < sorted[i - 1].closesAt) throw new AppError("hours_overlap", `day-${day}`);
    }
  }
}

export async function listOpeningHours(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(openingHours)
    .where(and(eq(openingHours.tenantId, tenantId), inCurrentBusiness(openingHours.businessId)))
    .orderBy(asc(openingHours.weekday), asc(openingHours.opensAt));
}

/** Remplace tous les horaires de la semaine (de l'entreprise déclarée). */
export async function replaceOpeningHours(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof openingHoursInput>,
) {
  const ranges = openingHoursInput.parse(raw);
  validateRanges(ranges);
  await tx
    .delete(openingHours)
    .where(and(eq(openingHours.tenantId, tenantId), inCurrentBusiness(openingHours.businessId)));
  if (ranges.length > 0) {
    await tx.insert(openingHours).values(ranges.map((range) => ({ tenantId, ...range })));
  }
  return ranges;
}
