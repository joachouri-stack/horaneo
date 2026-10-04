/**
 * Adresses des pages d'un site client (un seul endroit pour les changer).
 * Elles sont relatives au domaine du client : institut-lea.fr/prestations.
 */
export const SITE_PATHS = {
  home: "/",
  services: "/prestations",
  about: "/etablissement",
  gallery: "/galerie",
  testimonials: "/avis",
  practical: "/infos-pratiques",
  legal: "/mentions-legales",
  privacy: "/confidentialite",
  booking: "/reserver",
  /** Gestion d'un rendez-vous par le lien reçu : /rendez-vous/<jeton>. */
  appointment: "/rendez-vous",
} as const;

export type SitePathKey = keyof typeof SITE_PATHS;

export const categoryPath = (slug: string) => `${SITE_PATHS.services}/${slug}`;
