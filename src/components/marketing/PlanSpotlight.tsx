"use client";

import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ArrowLine } from "./line-icons";

type Labels = { previous: string; next: string; goTo: string };

/**
 * Rangée des packs. Sur téléphone et tablette : cartes à faire glisser, avec flèches et points
 * au-dessus (visibles tout de suite, les cartes sont hautes) pour passer d'un pack à l'autre (le glissé du doigt n'est pas toujours deviné). Sur
 * ordinateur : grille de trois, sans flèches. La lumière de chaque carte suit la souris
 * (variables --mx et --my lues par .hn-spot) ; rien ne bouge au toucher ni au clavier.
 * Un « tic » très léger accompagne chaque passage d'un pack à l'autre, seulement après un geste
 * de la personne (glissé, flèche, point) : jamais au chargement de la page.
 */

/** Petit « tic » synthétisé (aucun fichier) : note courte et douce, volume faible. */
function playTick(context: AudioContext) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1320, now);
  oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
}
export function PlanSpotlight({
  className,
  count,
  labels,
  children,
}: {
  className: string;
  count: number;
  labels: Labels;
  children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const previous = useRef(0);
  // Son autorisé une fois que la personne a touché la rangée ou ses commandes (règle des navigateurs).
  const audio = useRef<AudioContext | null>(null);
  const unlock = () => {
    if (audio.current || typeof window === "undefined" || !("AudioContext" in window)) return;
    audio.current = new AudioContext();
  };

  useEffect(() => {
    if (active === previous.current) return;
    previous.current = active;
    const context = audio.current;
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    playTick(context);
  }, [active]);

  // Carte la plus proche du centre de la rangée = point allumé.
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const update = () => {
      const cards = Array.from(element.querySelectorAll<HTMLElement>("[data-plan]"));
      const middle = element.getBoundingClientRect().left + element.clientWidth / 2;
      let best = 0;
      let distance = Infinity;
      cards.forEach((card, index) => {
        const box = card.getBoundingClientRect();
        const gap = Math.abs(box.left + box.width / 2 - middle);
        if (gap < distance) {
          distance = gap;
          best = index;
        }
      });
      setActive(best);
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      element.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const goTo = (index: number) => {
    const element = row.current;
    const card = element?.querySelectorAll<HTMLElement>("[data-plan]")[index];
    if (!element || !card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const left = card.offsetLeft - (element.clientWidth - card.offsetWidth) / 2;
    element.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-plan]");
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  };

  const arrow =
    "grid size-11 place-items-center rounded-full border border-hairline bg-white text-night shadow-[0_8px_20px_-12px_rgba(15,24,48,.45)] transition hover:border-violet/40 hover:text-violet disabled:opacity-35 disabled:hover:border-hairline disabled:hover:text-night";

  return (
    <div onPointerDownCapture={unlock} onKeyDownCapture={unlock}>
      {count > 1 && (
        <div className="flex items-center justify-center gap-4 lg:hidden">
          <button
            type="button"
            className={arrow}
            aria-label={labels.previous}
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          >
            <ArrowLine className="size-5 rotate-180" />
          </button>
          <div className="flex items-center gap-2">
            {Array.from({ length: count }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`${labels.goTo} ${index + 1}`}
                aria-current={index === active || undefined}
                onClick={() => goTo(index)}
                className="grid size-6 place-items-center"
              >
                <span
                  className={`block h-2 rounded-full transition-all ${
                    index === active ? "hn-brand-gradient w-6" : "w-2 bg-night/20"
                  }`}
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            className={arrow}
            aria-label={labels.next}
            disabled={active >= count - 1}
            onClick={() => goTo(active + 1)}
          >
            <ArrowLine className="size-5" />
          </button>
        </div>
      )}
      <div ref={row} className={className} onPointerMove={move}>
        {children}
      </div>
    </div>
  );
}
