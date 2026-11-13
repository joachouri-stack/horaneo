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
    // Dans une rangée qu'on fait glisser (packs, cartes sur téléphone), les éléments hors champ
    // sur le côté apparaissent avec la rangée : jamais une place vide au moment du glissé.
    const show = (element: Element) => {
      const parent = element.parentElement;
      const row = parent && parent.scrollWidth > parent.clientWidth ? parent : null;
      for (const item of row ? row.querySelectorAll(":scope > [data-reveal]") : [element]) {
        item.setAttribute("data-shown", "");
        observer.unobserve(item);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) show(entry.target);
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    // Ce qui est déjà à l'écran au chargement reste affiché sans attendre.
    for (const element of document.querySelectorAll("[data-reveal]")) {
      const box = element.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0 && box.height > 0) show(element);
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
