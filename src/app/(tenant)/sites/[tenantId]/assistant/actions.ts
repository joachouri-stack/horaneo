"use server";

import { z } from "zod";
import { withPlatform, withTenant } from "@/db/access";
import { chatModel } from "@/lib/ai/anthropic";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import { consumeQuota } from "@/modules/billing/usage";
import { chatInput, isNewConversation, prepareChat } from "@/modules/chatbot/chat";
import { AppError, type AppErrorCode } from "@/modules/errors";

/**
 * Chatbot du site public : une question du visiteur, une réponse. Rien n'est
 * conservé ; une nouvelle conversation compte dans le quota du mois du site.
 */

export type ChatResult = { ok: true; reply: string | null } | { ok: false; error: AppErrorCode };

export async function askAssistantAction(raw: z.input<typeof chatInput>): Promise<ChatResult> {
  try {
    const site = await currentSiteTenant();
    if (!publicLimits.chat.attempt(site.ip)) throw new AppError("rate_limited");
    const model = chatModel();
    if (!model) throw new AppError("chatbot_unavailable");
    // Informations de l'établissement relues maintenant (prix, horaires… à jour).
    const request = await withTenant(site.tenantId, (tx) => prepareChat(tx, site.tenantId, raw));
    // Nouvelle conversation : comptée dans le quota du mois (refusée s'il est atteint).
    if (isNewConversation(raw)) {
      await withPlatform((tx) => consumeQuota(tx, site.tenantId, "aiChatConversations"));
    }
    const answer = await model.reply(request);
    return { ok: true, reply: answer.kind === "text" ? answer.text : null };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code };
    if (error instanceof z.ZodError) return { ok: false, error: "invalid" };
    console.error("[chatbot]", error);
    return { ok: false, error: "chatbot_unavailable" };
  }
}
