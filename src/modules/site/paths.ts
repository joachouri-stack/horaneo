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
  cancellation: "/conditions-annulation",
  giftCard: "/carte-cadeau",
  booking: "/reserver",
  /** Gestion d'un rendez-vous par le lien reçu : /rendez-vous/<jeton>. */
  appointment: "/rendez-vous",
  /** Espace des clientes : leurs rendez-vous, cartes cadeaux et fidélité. */
  account: "/mes-rendez-vous",
} as const;

export type SitePathKey = keyof typeof SITE_PATHS;

/** Fiche d'application et icônes : le site s'installe sur l'écran d'accueil (hors plan du site). */
export const APP_PATHS = {
  manifest: "/app-manifest",
  icon: (size: number) => `/app-icon/${size}`,
} as const;

export const categoryPath = (slug: string) => `${SITE_PATHS.services}/${slug}`;

/** Page d'une professionnelle (entreprise) : /avec/laila. */
export const businessPath = (slug: string) => `/avec/${slug}`;
