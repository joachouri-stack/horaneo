"use client";

import { useEffect } from "react";

/**
 * Accueil : les éléments marqués data-reveal apparaissent en douceur quand ils
 * entrent à l'écran (une seule fois). Rien ne se cache si la personne a demandé
 * moins d'animations ou si le navigateur ne sait pas observer le défilement.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    // Ce qui est déjà à l'écran au chargement reste affiché sans attendre.
    for (const element of document.querySelectorAll("[data-reveal]")) {
      const box = element.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0 && box.height > 0)
        element.setAttribute("data-shown", "");
      else observer.observe(element);
    }
    root.classList.add("hn-motion");
    return () => {
      observer.disconnect();
      root.classList.remove("hn-motion");
    };
  }, []);
  return null;
}
