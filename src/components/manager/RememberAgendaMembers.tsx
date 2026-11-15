"use client";

import { useEffect } from "react";
import { agendaMembersCookie } from "@/lib/manager/agenda-members";

/** Durée de conservation du choix (un an). */
const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Garde le choix des membres affichés dans l'agenda (toute l'équipe ou
 * certains membres) : il est repris à la prochaine ouverture de l'agenda.
 */
export function RememberAgendaMembers({ tenantId, value }: { tenantId: string; value: string }) {
  useEffect(() => {
    document.cookie = `${agendaMembersCookie(tenantId)}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
  }, [tenantId, value]);
  return null;
}
