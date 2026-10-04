import { DEFAULT_LOCALE, type Locale } from "./locales";

export type Messages = { [key: string]: string | Messages };

/** Charge le fichier de traduction d'une langue. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
}

/** Complète les traductions manquantes avec la langue de repli (le français). */
export function withFallback(messages: Messages, fallback: Messages): Messages {
  const result: Messages = { ...fallback };
  for (const [key, value] of Object.entries(messages)) {
    const base = fallback[key];
    result[key] = typeof value === "object" && typeof base === "object" ? withFallback(value, base) : value;
  }
  return result;
}

export async function loadMessagesWithFallback(locale: Locale): Promise<Messages> {
  const messages = await loadMessages(locale);
  if (locale === DEFAULT_LOCALE) return messages;
  return withFallback(messages, await loadMessages(DEFAULT_LOCALE));
}
