"use client";

import { useEffect, useState } from "react";

/**
 * Mot qui change tout seul dans le titre de l'accroche (« institut », « salon »…), avec un
 * fondu montant. Sans JavaScript ou si moins de mouvement est demandé : le premier mot, fixe.
 * Purement décoratif : le titre complet est donné à part aux lecteurs d'écran.
 */
export function RotatingWord({ words, interval = 2400 }: { words: string[]; interval?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % words.length), interval);
    return () => window.clearInterval(timer);
  }, [words.length, interval]);

  return (
    <span aria-hidden="true" className="block">
      {/* Deux niveaux : l'apparition du mot et le dégradé qui glisse sont deux animations. */}
      <span key={index} className="hn-word inline-block">
        <span className="hn-shimmer inline-block pb-[0.08em]">{words[index]}.</span>
      </span>
    </span>
  );
}
