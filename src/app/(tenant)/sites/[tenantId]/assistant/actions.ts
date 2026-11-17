"use server";

import { z } from "zod";
import { withPlatform, withTenant } from "@/db/access";
import { chatModel } from "@/lib/ai/anthropic";
import { currentSiteTenant, publicLimits } from "@/lib/site/current";
import { consumeQuota } from "@/modules/billing/usage";
import { chatInput, isNewConversation, prepareChat } from "@/modules/chatbot/chat";
import { conversationToken, isValidConversation } from "@/modules/chatbot/conversation";
import { type BookingLink, chatTools, runChatTool } from "@/modules/chatbot/tools";
import { AppError, type AppErrorCode } from "@/modules/errors";

/**
 * Chatbot du site public : une question du visiteur, une réponse. Rien n'est
 * conservé ; une nouvelle conversation compte dans le quota du mois du site.
 */

export type ChatResult =
  | { ok: true; reply: string | null; links: BookingLink[]; conversation: string }
  | { ok: false; error: AppErrorCode };

/** Boutons « Réserver » affichés au plus sous une réponse. */
const MAX_LINKS = 3;

export async function askAssistantAction(raw: z.input<typeof chatInput>): Promise<ChatResult> {
  try {
    const site = await currentSiteTenant();
    if (!publicLimits.chat.attempt(site.ip)) throw new AppError("rate_limited");
    const model = chatModel();
    if (!model) throw new AppError("chatbot_unavailable");
    // Informations de l'établissement relues maintenant (prix, horaires… à jour).
    const request = await withTenant(site.tenantId, (tx) => prepareChat(tx, site.tenantId, raw));
    // Nouvelle conversation (ou jeton absent, faux, expiré) : comptée dans le quota du mois
    // (refusée s'il est atteint), et un jeton est remis pour les questions suivantes.
    let conversation = raw.conversation ?? "";
    if (isNewConversation(raw) || !isValidConversation(conversation, site.tenantId)) {
      await withPlatform((tx) => consumeQuota(tx, site.tenantId, "aiChatConversations"));
      conversation = conversationToken(site.tenantId);
    }
    if (!publicLimits.chatConversation.attempt(conversation)) throw new AppError("rate_limited");
    // Créneaux libres consultés à la demande du modèle ; chaque recherche donne un lien Réserver.
    const links: BookingLink[] = [];
    const answer = await model.reply({
      ...request,
      tools: chatTools,
      runTool: async (name, input) => {
        const { result, link } = await withTenant(site.tenantId, (tx) =>
          runChatTool(tx, site.tenantId, name, input),
        );
        if (link) {
          const index = links.findIndex((item) => item.serviceId === link.serviceId);
          if (index >= 0) links.splice(index, 1);
          links.push(link);
        }
        return result;
      },
    });
    if (answer.kind !== "text") return { ok: true, reply: null, links: [], conversation };
    return { ok: true, reply: answer.text, links: links.slice(-MAX_LINKS), conversation };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code };
    if (error instanceof z.ZodError) return { ok: false, error: "invalid" };
    console.error("[chatbot]", error);
    return { ok: false, error: "chatbot_unavailable" };
  }
}
