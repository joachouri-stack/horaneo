"use client";

import { useEffect } from "react";

/**
 * Ouvre la catégorie visée par l'adresse (#formations) et la fait défiler à
 * l'écran : au chargement de la page et quand on clique sur un lien du menu
 * qui mène à une autre catégorie de la même page.
 */
export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
