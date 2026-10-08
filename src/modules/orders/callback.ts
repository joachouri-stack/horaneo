import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { plans } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { queueMessage } from "@/modules/messages/queue";
import { normalizePhone } from "@/modules/phone";

/**
 * Demande « Être rappelé » (rôle plateforme) : tant que la commande en ligne
 * des packs payants est fermée, le visiteur laisse son numéro et l'équipe le
 * rappelle. La demande part par e-mail aux administratrices.
 */

export const callbackInput = z.object({
  name: z.string().trim().min(2).max(120),
  businessName: z.string().trim().max(120).default(""),
  phone: z.string().trim().min(6).max(40),
  email: z.union([z.literal(""), z.email().max(200)]).default(""),
  planCode: z.string().trim().max(40).default(""),
  message: z.string().trim().max(1000).default(""),
  locale: z.string().min(2).max(5).default("fr"),
});

export async function requestCallback(tx: Transaction, raw: z.input<typeof callbackInput>) {
  const input = callbackInput.parse(raw);
  const phone = normalizePhone(input.phone, "FR", "phone");
  if (!phone) throw new AppError("phone_invalid", "phone");
  const [plan] = input.planCode ? await tx.select().from(plans).where(eq(plans.code, input.planCode)) : [];
  await queueMessage(tx, {
    tenantId: null,
    template: "admin.callback_request",
    locale: input.locale,
    data: { ...input, phone, planCode: plan?.code ?? "" },
    dedupeKey: null,
  });
  return { ok: true as const };
}
