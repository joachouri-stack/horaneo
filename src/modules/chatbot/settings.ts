import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { currentBusinessId } from "@/db/access";
import type { Transaction } from "@/db/client";
import { businessSettings } from "@/db/schema";
import { quotaStatus } from "@/modules/billing/usage";
import { AppError } from "@/modules/errors";
import { getTenantPlan } from "@/modules/quotas";

/**
 * Réglage du chatbot par l'établissement : la gérante peut le couper sur son
 * site (activé par défaut quand le pack le comprend), et voit les conversations
 * du mois.
 */

async function businessOf(tx: Transaction, businessId?: string) {
  const id = businessId ?? (await currentBusinessId(tx));
  if (!id) throw new AppError("not_found");
  return id;
}

export async function chatbotSettings(
  tx: Transaction,
  tenantId: string,
  businessId?: string,
  now = new Date(),
) {
  const id = await businessOf(tx, businessId);
  const { features } = await getTenantPlan(tx, tenantId);
  const [row] = await tx
    .select({ enabled: businessSettings.chatbotEnabled })
    .from(businessSettings)
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, id)));
  if (!row) throw new AppError("not_found");
  const included = Boolean(features.aiChatbot);
  return {
    businessId: id,
    included,
    enabled: row.enabled,
    /** Proposé sur le site : compris dans le pack et laissé activé par la gérante. */
    active: included && row.enabled,
    usage: included ? await quotaStatus(tx, tenantId, "aiChatConversations", now) : null,
  };
}

export const chatbotSettingsInput = z.object({ enabled: z.boolean() });

export async function setChatbotEnabled(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof chatbotSettingsInput>,
  businessId?: string,
) {
  const input = chatbotSettingsInput.parse(raw);
  const current = await chatbotSettings(tx, tenantId, businessId);
  if (!current.included) throw new AppError("feature_unavailable");
  await tx
    .update(businessSettings)
    .set({ chatbotEnabled: input.enabled })
    .where(and(eq(businessSettings.tenantId, tenantId), eq(businessSettings.businessId, current.businessId)));
  return { enabled: input.enabled };
}
