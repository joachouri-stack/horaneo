import "server-only";
import { resolveLocale } from "@/i18n/translator";
import { requireManager } from "./access";

/** Contexte commun des pages de l'espace gérante (droits vérifiés). */
export async function managerPage(params: Promise<{ locale: string; tenantId: string }>) {
  const { locale: rawLocale, tenantId } = await params;
  const locale = resolveLocale(rawLocale);
  const access = await requireManager(locale, tenantId);
  const tz = access.tenant.timezone;
  const fmt = {
    time: (date: Date) =>
      new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(date),
    day: (date: Date) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: tz,
      }).format(date),
    short: (date: Date) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: tz,
      }).format(date),
    money: (cents: number, currency = access.tenant.currency) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100),
  };
  return { locale, tenantId, ...access, fmt, base: `/espace/${tenantId}` };
}
