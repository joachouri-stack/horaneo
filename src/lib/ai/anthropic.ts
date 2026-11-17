import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/config/env";
import { AppError } from "@/modules/errors";
import type { ChatModel } from "@/modules/chatbot/model";

/**
 * Chatbot : réponses de Claude (API Anthropic). La clé vient de l'environnement
 * (ANTHROPIC_API_KEY, réglée dans Coolify) et n'est jamais écrite dans le code.
 */

/** Modèles qui acceptent le repli automatique côté serveur en cas de refus. */
const WITH_FALLBACK = /^claude-(opus|sonnet|fable)-/;

function createChatModel(apiKey: string): ChatModel {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
  return {
    async reply({ model, system, messages, maxTokens }) {
      try {
        const response = await client.beta.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages,
          // Réponses courtes et rapides : peu de réflexion suffit pour répondre sur un établissement.
          output_config: { effort: "low" },
          ...(WITH_FALLBACK.test(model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
        if (response.stop_reason === "refusal") return { kind: "refused" };
        const text = response.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("")
          .trim();
        return text ? { kind: "text", text } : { kind: "refused" };
      } catch (error) {
        if (error instanceof Anthropic.RateLimitError) {
          console.error("[chatbot] limite du fournisseur atteinte");
        } else if (error instanceof Anthropic.APIError) {
          console.error("[chatbot] erreur du fournisseur", error.status, error.message);
        } else {
          console.error("[chatbot]", error);
        }
        throw new AppError("chatbot_unavailable");
      }
    },
  };
}

let override: ChatModel | null | undefined;
let cached: { key: string; model: ChatModel } | undefined;

/** Fournisseur d'IA configuré, ou null si la clé n'est pas renseignée (chatbot masqué). */
export function chatModel(): ChatModel | null {
  if (override !== undefined) return override;
  const key = env().ANTHROPIC_API_KEY;
  if (!key) return null;
  if (cached?.key !== key) cached = { key, model: createChatModel(key) };
  return cached.model;
}

export function setChatModelForTests(model: ChatModel | null | undefined) {
  override = model;
}
