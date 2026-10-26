/**
 * Réglages d'affichage des sites clients.
 */
export const POPULAR_SERVICES = {
  /** Période prise en compte, en jours. */
  days: 90,
  /** Nombre de prestations marquées « Populaire » au plus. */
  max: 2,
  /** Rendez-vous minimum sur la période pour qu'une prestation soit marquée. */
  minBookings: 3,
} as const;
