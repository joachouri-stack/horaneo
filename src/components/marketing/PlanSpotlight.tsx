"use client";

import type { PointerEvent, ReactNode } from "react";

/**
 * Grille des packs : la lumière de chaque carte suit le pointeur (variables
 * --mx et --my lues par .hn-spot). Rien ne bouge au toucher ni au clavier.
 */
export function PlanSpotlight({ className, children }: { className: string; children: ReactNode }) {
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-plan]");
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  };
  return (
    <div className={className} onPointerMove={move}>
      {children}
    </div>
  );
}
