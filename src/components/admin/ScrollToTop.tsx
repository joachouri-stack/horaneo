"use client";

import { useEffect } from "react";

/**
 * Remonte en haut de la page à l'arrivée (« Voir son espace » depuis le bas d'une page de
 * l'admin) : sinon la page s'ouvre à la même hauteur et le bandeau de retour est hors de vue.
 */
export function ScrollToTop() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}
