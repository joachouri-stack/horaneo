import "server-only";
import { resolveLocale } from "@/i18n/translator";
import { withTenant } from "@/db/access";
import { currencySymbol } from "@/lib/format";
import { redirect } from "@/i18n/navigation";
import { canAccess, type ManagerArea } from "@/modules/team/access";
import { requireManager } from "./access";

/**
 * Contexte commun des pages de l'espace gérante (droits vérifiés). `area` :
 * partie de l'espace de la page ; un collaborateur à qui la gérante ne l'a pas
 * ouverte revient à l'accueil de l'espace.
 */
export async function managerPage(params: Promise<{ locale: string; tenantId: string }>, area: ManagerArea) {
  const { locale: rawLocale, tenantId } = await params;
  const locale = resolveLocale(rawLocale);
  const access = await requireManager(locale, tenantId);
  if (!canAccess(access.space, area)) redirect({ href: `/espace/${tenantId}`, locale });
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
    /** Symbole de la devise de l'entreprise (libellés des champs de montant). */
    currency: currencySymbol(access.tenant.currency, locale),
  };
  /** Données de l'entreprise de la gérante (ses clientes, son agenda…), jamais celles d'une autre. */
  const db = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant(tenantId, fn, undefined, access.businessId);
  return { locale, tenantId, ...access, fmt, db, base: `/espace/${tenantId}` };
}
