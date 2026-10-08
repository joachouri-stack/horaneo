import { ENABLED_LOCALES } from "./enabled";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "./locales";

/**
 * Site commercial : la racine mène pour de bon à la langue par défaut (308), et
 * une langue prévue mais pas encore activée (/en, /es, /ru) mène à la même page
 * en langue par défaut, sans être mémorisée (307 : elle pourra ouvrir plus tard).
 */
export function platformLocaleRedirect(
  url: URL,
  enabled: readonly Locale[] = ENABLED_LOCALES,
): { url: URL; status: 307 | 308 } | null {
  if (url.pathname === "/") {
    const target = new URL(url);
    target.pathname = `/${DEFAULT_LOCALE}`;
    return { url: target, status: 308 };
  }
  const [, first, ...rest] = url.pathname.split("/");
  if (!first || !isSupportedLocale(first) || enabled.includes(first)) return null;
  const target = new URL(url);
  target.pathname = [``, DEFAULT_LOCALE, ...rest].join("/").replace(/\/$/, "");
  return { url: target, status: 307 };
}
