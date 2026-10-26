/**
 * Groupes de la liste des clientes (filtres et étiquettes de l'espace gérante).
 */
export const CUSTOMER_SEGMENTS = {
  /** Fidèle : au moins ce nombre de visites passées. */
  loyalVisits: 3,
  /** Nouvelle : fiche créée depuis moins de ce nombre de jours. */
  newDays: 30,
  /** À relancer : déjà venue, pas revenue depuis ce nombre de jours et sans rendez-vous prévu. */
  inactiveDays: 60,
} as const;
