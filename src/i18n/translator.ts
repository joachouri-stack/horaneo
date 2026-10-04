import { createTranslator, type Messages as AppMessages } from "next-intl";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./locales";
import { loadMessagesWithFallback } from "./messages";
import { ENABLED_LOCALES } from "./enabled";

/** Langue activée la plus proche de celle demandée (sinon le français). */
export function resolveLocale(value: string | null | undefined): Locale {
  return value && isSupportedLocale(value) && ENABLED_LOCALES.includes(value) ? value : DEFAULT_LOCALE;
}

/** Traductions hors des pages (e-mails, SMS, tâches planifiées). */
export async function getTranslator(locale: Locale) {
  const messages = await loadMessagesWithFallback(locale);
  return createTranslator({ locale, messages: messages as unknown as AppMessages });
}
