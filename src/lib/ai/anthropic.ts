import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/config/env";
import { AppError } from "@/modules/errors";
import type { ChatModel } from "@/modules/chatbot/model";

/**
 * Chatbot : réponses de Claude (API Anthropic). La clé vient de l'environnement
 * (ANTHROPIC_API_KEY, réglée dans Coolify) et n'est jamais écrite dans le code.
 */

/** Tours d'outils au plus avant la réponse finale. */
const MAX_TOOL_ROUNDS = 4;

/** Modèles qui acceptent le repli automatique côté serveur en cas de refus. */
const WITH_FALLBACK = /^claude-(opus|sonnet|fable)-/;

function createChatModel(apiKey: string): ChatModel {
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
  return {
    async reply({ model, system, messages, maxTokens, tools, runTool }) {
      try {
        const conversation: Anthropic.Beta.BetaMessageParam[] = messages.map((turn) => ({
          role: turn.role,
          content: turn.content,
        }));
        // Le modèle peut consulter un outil (créneaux libres), puis répondre : quelques tours au plus.
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const response = await client.beta.messages.create({
            model,
            max_tokens: maxTokens,
            system,
            messages: conversation,
            ...(tools && tools.length > 0 ? { tools, tool_choice: { type: "auto" as const } } : {}),
            // Réponses courtes et rapides : peu de réflexion suffit pour répondre sur un établissement.
            output_config: { effort: "low" },
            ...(WITH_FALLBACK.test(model)
              ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
              : {}),
          });
          if (response.stop_reason === "refusal") return { kind: "refused" };
          const calls = response.content.filter(
            (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
          );
          if (response.stop_reason === "tool_use" && calls.length > 0 && runTool) {
            // Contenu complet renvoyé tel quel (réflexion comprise), puis tous les résultats en un message.
            conversation.push({ role: "assistant", content: response.content });
            const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
            for (const call of calls) {
              results.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: await runTool(call.name, call.input),
              });
            }
            conversation.push({ role: "user", content: results });
            continue;
          }
          const text = response.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("")
            .trim();
          return text ? { kind: "text", text } : { kind: "refused" };
        }
        return { kind: "refused" };
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
