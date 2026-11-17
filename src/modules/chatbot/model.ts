/**
 * Ce dont le chatbot a besoin chez le fournisseur d'IA : une réponse à une
 * conversation. L'implémentation réelle est `chatModel()` (src/lib/ai/anthropic.ts) ;
 * les tests utilisent une fausse, sans appel réseau.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatModelReply =
  | { kind: "text"; text: string }
  /** Le modèle a refusé de répondre (sécurité) : la cliente est orientée vers l'établissement. */
  | { kind: "refused" };

/** Outil que le modèle peut appeler (consultation seulement, ex. créneaux libres). */
export type ChatToolDefinition = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
};

export interface ChatModel {
  reply(input: {
    model: string;
    /** Consignes et informations de l'établissement (relues à chaque question). */
    system: string;
    messages: ChatTurn[];
    maxTokens: number;
    tools?: ChatToolDefinition[];
    /** Exécute un outil demandé par le modèle et renvoie son résultat (texte). */
    runTool?: (name: string, input: unknown) => Promise<string>;
  }): Promise<ChatModelReply>;
}
