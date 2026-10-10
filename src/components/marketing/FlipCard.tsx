"use client";

import { type ReactNode, useRef, useState } from "react";
import { FlipIcon } from "./icons";

/**
 * Carte de pack à deux faces : le recto présente l'offre, le verso la
 * détaille. Chaque carte se retourne seule, avec un vrai bouton (clavier,
 * tactile), jamais au survol. La face cachée est inerte (ni lue, ni atteinte
 * au clavier) et le focus passe sur le bouton de la face qui apparaît.
 * Les faces sont rendues côté serveur ; animations dans globals.css (.hn-flip).
 */
export function FlipCard({
  front,
  back,
  labels,
  surface,
  tone,
}: {
  front: ReactNode;
  back: ReactNode;
  /** Textes des boutons, et leurs noms complets pour les lecteurs d'écran (avec le nom du pack). */
  labels: { details: string; detailsLabel: string; back: string; backLabel: string };
  /** Classes de la carte (fond, bordure, ombre), identiques sur les deux faces. */
  surface: string;
  /** Couleur des boutons de retournement : carte claire ou bleu nuit. */
  tone: "light" | "dark";
}) {
  const [flipped, setFlipped] = useState(false);
  const [turned, setTurned] = useState(false);
  const toBack = useRef<HTMLButtonElement>(null);
  const toFront = useRef<HTMLButtonElement>(null);

  const turn = (next: boolean) => {
    setFlipped(next);
    setTurned(true);
    // Après le rendu, la face visible n'est plus inerte : son bouton reçoit le focus.
    requestAnimationFrame(() => (next ? toFront : toBack).current?.focus({ preventScroll: true }));
  };

  const button = `group/flip mx-auto mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[0.92rem] font-semibold underline-offset-4 transition-colors hover:underline ${
    tone === "dark" ? "text-gold hover:text-white" : "text-navy hover:text-copper"
  }`;
  const icon =
    "size-[18px] flex-none transition-transform duration-500 group-hover/flip:rotate-180 motion-reduce:transition-none";
  const face = `hn-flip-face flex flex-col ${surface}`;

  return (
    <div data-flipped={flipped} data-turned={turned} className="hn-flip h-full w-full">
      <div className="hn-flip-inner">
        <div className={`${face} hn-flip-front`} inert={flipped}>
          {front}
          <button
            ref={toBack}
            type="button"
            aria-label={labels.detailsLabel}
            onClick={() => turn(true)}
            className={button}
          >
            <FlipIcon className={icon} />
            {labels.details}
          </button>
        </div>
        <div className={`${face} hn-flip-back`} inert={!flipped}>
          {back}
          <button
            ref={toFront}
            type="button"
            aria-label={labels.backLabel}
            onClick={() => turn(false)}
            className={button}
          >
            <FlipIcon className={icon} />
            {labels.back}
          </button>
        </div>
      </div>
    </div>
  );
}
