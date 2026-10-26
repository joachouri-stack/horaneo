"use client";

import { useTranslations } from "next-intl";
import { formatDuration } from "@/modules/site/format";

/**
 * Texte d'une erreur vue par une cliente : la version propre au site si elle
 * existe (« site.errors »), sinon le texte commun (« errors »).
 */
export function useSiteError() {
  const tSite = useTranslations("site.errors");
  const tErrors = useTranslations("errors");
  return (code: string) => {
    if (tSite.has(code as "invalid")) return tSite(code as "invalid");
    if (tErrors.has(code as "invalid")) return tErrors(code as "invalid");
    return tErrors("invalid");
  };
}

/** Durées « 45 min », « 1 h 30 » et nom de prestation suivi de sa durée (« Massage (1 h) »). */
export function useDurations() {
  const tServices = useTranslations("site.services");
  const t = useTranslations("booking");
  const duration = (minutes: number) =>
    formatDuration((key, values) => tServices(key as "durationMinutes", values), minutes);
  const withDuration = (name: string, minutes: number) =>
    t("serviceDuration", { name, duration: duration(minutes) });
  return { duration, withDuration };
}
