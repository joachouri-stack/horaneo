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

/**
 * Palettes proposées à la gérante (« Mon site » → « Couleurs du site ») :
 * couleur principale (boutons, titres) et secondaire (fonds des blocs).
 * Le thème du site garde de toute façon un contraste lisible.
 */
export const BRAND_PALETTES = {
  rose: { primary: "#b4636e", secondary: "#f3e1e1" },
  terracotta: { primary: "#b5552f", secondary: "#f4e3d7" },
  sage: { primary: "#5f7d64", secondary: "#e4ece2" },
  navy: { primary: "#2c3e6b", secondary: "#e3e8f3" },
  plum: { primary: "#7a3b69", secondary: "#efe1ec" },
  gold: { primary: "#9a7228", secondary: "#f3ead6" },
  black: { primary: "#1f1f1f", secondary: "#efe9e2" },
} as const;
export type BrandPaletteKey = keyof typeof BRAND_PALETTES;
