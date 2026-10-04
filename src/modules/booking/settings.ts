import { and, eq } from "drizzle-orm";
import { currentBusinessId } from "@/db/access";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { getTenantPlan } from "@/modules/quotas";

/** Règles de réservation et préférences, réglables par la gérante. */

export const SLOT_INTERVALS = [5, 10, 15, 20, 30, 60] as const;

export const bookingSettingsInput = z.object({
  minNoticeHours: z.coerce.number().min(0).max(168),
  maxAdvanceDays: z.coerce.number().int().min(1).max(365),
  slotIntervalMinutes: z.coerce
    .number()
    .int()
    .refine((value) => (SLOT_INTERVALS as readonly number[]).includes(value)),
  maxServicesPerBooking: z.coerce.number().int().min(1).max(3),
  cancellationDeadlineHours: z.coerce.number().int().min(0).max(168),
  depositEnabled: z.boolean(),
  depositType: z.enum(["percent", "fixed"]),
  /** Pourcentage, ou montant en euros (« 20 », « 20,50 »). */
  depositValue: z
    .string()
    .trim()
    .regex(/^\d{1,5}([.,]\d{1,2})?$/),
  dailySummaryEnabled: z.boolean(),
  monthlySummaryEnabled: z.boolean(),
});

/** Réglages de l'entreprise donnée, ou de celle déclarée pour la transaction. */
async function targetBusiness(tx: Transaction, businessId?: string) {
  const id = businessId ?? (await currentBusinessId(tx));
  if (!id) throw new AppError("not_found");
  return id;
}

export async function getBookingSettings(tx: Transaction, tenantId: string, businessId?: string) {
  const id = await targetBusiness(tx, businessId);
  const [settings] = await tx
    .select()
    .from(businessSettings)
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)));
  if (!settings) throw new AppError("not_found");
  return settings;
}

export async function updateBookingSettings(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof bookingSettingsInput>,
  businessId?: string,
) {
  const input = bookingSettingsInput.parse(raw);
  const id = await targetBusiness(tx, businessId);
  const { features } = await getTenantPlan(tx, tenantId);
  const amount = Number(input.depositValue.replace(",", "."));
  const depositValue = input.depositType === "percent" ? Math.round(amount) : Math.round(amount * 100);
  if (input.depositType === "percent" && (depositValue < 1 || depositValue > 100))
    throw new AppError("invalid", "depositValue");
  if (input.depositEnabled && !features.onlinePayment)
    throw new AppError("feature_unavailable", "depositEnabled");
  const [updated] = await tx
    .update(businessSettings)
    .set({
      minNoticeMinutes: Math.round(input.minNoticeHours * 60),
      maxAdvanceDays: input.maxAdvanceDays,
      slotIntervalMinutes: input.slotIntervalMinutes,
      maxServicesPerBooking: input.maxServicesPerBooking,
      cancellationDeadlineHours: input.cancellationDeadlineHours,
      depositEnabled: input.depositEnabled,
      depositType: input.depositType,
      depositValue,
      dailySummaryEnabled: input.dailySummaryEnabled,
      monthlySummaryEnabled: input.monthlySummaryEnabled,
    })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)))
    .returning();
  return updated;
}
