import { z } from "zod";
import type { LocalizedText } from "@/i18n/locales";

/**
 * Champ traduisible saisi dans un formulaire : le texte est rangé sous la
 * langue principale du tenant, sans effacer les autres langues déjà saisies.
 */
export function setLocalized(
  previous: LocalizedText | null | undefined,
  locale: string,
  value: string | null | undefined,
): LocalizedText {
  const next: LocalizedText = { ...(previous ?? {}) };
  const text = (value ?? "").trim();
  if (text) next[locale as keyof LocalizedText] = text;
  else delete next[locale as keyof LocalizedText];
  return next;
}

export const localizedTextSchema = z.record(z.string(), z.string()) as z.ZodType<LocalizedText>;
