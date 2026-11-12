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

/**
 * Son de passage d'un pack à l'autre, façon interface moderne (synthétisé, aucun fichier) :
 * un « clic » feutré très court, puis une note cristalline brève. Elle monte légèrement vers la
 * droite et descend vers la gauche, pour accompagner le mouvement. Volume faible.
 */
function playTick(context: AudioContext) {
  const now = context.currentTime;

  // Clic tactile : un petit « toc » sourd, comme un retour haptique, identique dans les deux sens.
  const tone = context.createOscillator();
  const gain = context.createGain();
  tone.type = "sine";
  tone.frequency.setValueAtTime(300, now);
  tone.frequency.exponentialRampToValueAtTime(160, now + 0.03);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  tone.connect(gain).connect(context.destination);
  tone.start(now);
  tone.stop(now + 0.05);

  // Léger souffle de 8 ms dans les aigus pour la netteté du clic.
  const length = Math.floor(context.sampleRate * 0.008);
  const noise = context.createBuffer(1, length, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i += 1) samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const click = context.createBufferSource();
  click.buffer = noise;
  const high = context.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 2500;
  const clickGain = context.createGain();
  clickGain.gain.value = 0.04;
  click.connect(high).connect(clickGain).connect(context.destination);
  click.start(now);
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
  // Son débloqué au premier toucher (ou clic, ou touche) n'importe où sur la page : les
  // navigateurs, Safari sur iPhone en tête, n'autorisent le son qu'à l'intérieur d'un geste, et
  // un glissé seul n'en est pas un. Le déblocage joue un son vide, puis on n'écoute plus.
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const events = ["pointerdown", "touchend", "click", "keydown"] as const;
    const unlock = () => {
      const context = (audio.current ??= new Context());
      if (context.state === "suspended") void context.resume();
      const silence = context.createBufferSource();
      silence.buffer = context.createBuffer(1, 1, 22050);
      silence.connect(context.destination);
      silence.start(0);
      if (context.state === "running")
        for (const event of events) document.removeEventListener(event, unlock, true);
    };
    for (const event of events) document.addEventListener(event, unlock, true);
    return () => {
      for (const event of events) document.removeEventListener(event, unlock, true);
    };
  }, []);

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
    <div>
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
