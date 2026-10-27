"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ArrowIcon, CategoryIcon, CheckIcon } from "./icons";

let audio: AudioContext | null = null;

/**
 * Petit son doux au changement de professionnelle (deux notes brèves, volume bas),
 * fabriqué par le navigateur : aucun fichier à charger. Joué seulement après un clic.
 */
function playSwitchSound() {
  try {
    audio ??= new AudioContext();
    const start = audio.currentTime;
    [880, 1320].forEach((frequency, index) => {
      const oscillator = audio!.createOscillator();
      const gain = audio!.createGain();
      const at = start + index * 0.07;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.05, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      oscillator.connect(gain).connect(audio!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.25);
    });
  } catch {
    // Son non disponible (ancien navigateur) : sans importance.
  }
}

export type CategoryCard = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  featured: boolean;
  businessId: string;
  /** « avec Laïla » (site à plusieurs professionnelles). */
  withLabel: string;
  /** « 4 soins » : nombre de prestations dans la catégorie. */
  servicesLabel: string;
  /** Texte du lien pour les lecteurs d'écran. */
  ariaLabel: string;
  priceLabel: string;
  href: string;
};

export type CategoryGroup = {
  id: string;
  /** Prénom ou nom de la professionnelle. */
  name: string;
  /** Spécialité affichée sous le titre (facultative). */
  subtitle: string;
  /** Photo ronde (rendue côté serveur) ; sinon le logo de sa boutique ; sinon l'initiale. */
  avatar: ReactNode | null;
  initial: string;
  /** Nom de sa boutique (facultatif), affiché sous son prénom. */
  shopName?: string | null;
  /** Logo de sa boutique en pastille sur la photo (quand elle a aussi une photo). */
  badge?: ReactNode | null;
};

/**
 * Catégories de l'accueil, en cartes toutes de même taille (nom, nombre de
 * prestations, description, prix de départ). Sur un site à plusieurs
 * professionnelles, deux (ou plus) grands boutons côte à côte permettent de
 * choisir la professionnelle : seules ses cartes sont affichées.
 */
export function CategoryGrid({
  cards,
  groups,
  labels,
}: {
  cards: CategoryCard[];
  groups: CategoryGroup[];
  labels: { see: string; speciality: string; choose: string };
}) {
  const withCards = groups.filter((group) => cards.some((card) => card.businessId === group.id));
  const [selected, setSelected] = useState<string | null>(withCards[0]?.id ?? null);
  // Téléphone et tablette (pas de survol possible) : la carte qui passe au
  // milieu de l'écran pendant le défilement ressort, comme au survol sur ordinateur.
  const rootRef = useRef<HTMLDivElement>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !window.matchMedia("(hover: none)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const centered = entries.filter((entry) => entry.isIntersecting);
        if (centered.length > 0) setSpotlight((centered[0].target as HTMLElement).dataset.card ?? null);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.querySelectorAll<HTMLElement>("[data-card]").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [selected]);

  const grid = (list: CategoryCard[]) => (
    <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((card, index) => (
        <li
          key={card.id}
          data-card={card.id}
          style={{ animationDelay: `${index * 50}ms` }}
          className="motion-safe:animate-[card-in_.45s_ease-out_both]"
        >
          <Link
            href={card.href}
            aria-label={card.ariaLabel}
            data-spotlight={spotlight === card.id}
            className="group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-site-border bg-site-card p-5 shadow-[0_10px_30px_-22px_rgba(0,0,0,0.45)] transition duration-300 ease-out active:scale-[0.98] sm:p-6 hover:-translate-y-1 hover:border-site-accent hover:shadow-[0_22px_44px_-22px_rgba(0,0,0,0.45)] data-[spotlight=true]:-translate-y-1 data-[spotlight=true]:border-site-accent data-[spotlight=true]:shadow-[0_22px_44px_-22px_rgba(0,0,0,0.45)]"
          >
            {/* Filet de couleur en haut de la carte, qui s'étire quand elle ressort. */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 origin-left scale-x-[0.18] bg-site-accent transition-transform duration-500 ease-out group-hover:scale-x-100 group-data-[spotlight=true]:scale-x-100"
            />
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-site-surface text-site-accent ring-1 ring-site-border transition duration-300 group-hover:bg-site-button group-hover:text-site-on-button group-data-[spotlight=true]:bg-site-button group-data-[spotlight=true]:text-site-on-button">
                <CategoryIcon icon={card.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-site-display text-[1.45rem] font-medium leading-tight sm:text-[1.6rem]">
                  {card.name}
                </h3>
                <p className="mt-1 text-sm text-site-muted">
                  {card.featured && (
                    <span className="mr-2 font-semibold text-site-accent">{labels.speciality} ·</span>
                  )}
                  {[card.withLabel, card.servicesLabel].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            {card.description && (
              <p className="mt-3 line-clamp-2 text-[0.95rem] leading-relaxed text-site-muted sm:mt-4 sm:line-clamp-none">
                {card.description}
              </p>
            )}
            <span aria-hidden="true" className="block min-h-4 flex-1 sm:min-h-5" />
            <div className="flex items-center justify-between gap-3 border-t border-site-border pt-3 sm:pt-4">
              <span className="rounded-full bg-site-surface px-3 py-1 text-base font-bold text-site-accent">
                {card.priceLabel}
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="max-sm:sr-only">{labels.see}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-site-surface text-site-accent transition duration-300 group-hover:translate-x-1 group-hover:bg-site-button group-hover:text-site-on-button group-data-[spotlight=true]:translate-x-1 group-data-[spotlight=true]:bg-site-button group-data-[spotlight=true]:text-site-on-button">
                  <ArrowIcon />
                </span>
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );

  // Une seule professionnelle (ou aucune répartition) : une seule grille, sans titre.
  if (withCards.length < 2) return <div ref={rootRef}>{grid(cards)}</div>;

  return (
    <div ref={rootRef}>
      <p className="mt-8 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-site-muted sm:text-sm sm:tracking-[0.12em]">
        {labels.choose}
      </p>
      <div
        role="group"
        aria-label={labels.choose}
        className={`mt-3 grid gap-3 ${withCards.length === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}
      >
        {withCards.map((group) => {
          const active = selected === group.id;
          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (group.id !== selected) playSwitchSound();
                setSelected(group.id);
              }}
              className={`relative flex min-w-0 items-center gap-3 rounded-[1.25rem] border-2 p-2.5 pr-9 text-left transition duration-300 active:scale-[0.98] sm:gap-4 sm:p-3 sm:pr-11 ${
                active
                  ? "border-site-text bg-site-text text-site-bg shadow-[0_14px_30px_-18px_rgba(0,0,0,0.55)]"
                  : // Professionnelle non choisie : contour coloré et léger halo qui invite à toucher.
                    "border-site-accent/60 bg-site-card text-site-text shadow-[0_10px_24px_-18px_rgba(0,0,0,0.45)] hover:border-site-accent motion-safe:animate-[pro-hint_1.8s_ease-in-out_0.8s_2]"
              }`}
            >
              <span className="relative shrink-0">
                <span
                  className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-site-surface font-site-display text-xl text-site-accent ring-2 sm:h-14 sm:w-14 ${active ? "ring-site-bg/40" : "ring-site-border"}`}
                >
                  {group.avatar ?? group.initial}
                </span>
                {group.badge && (
                  <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-site-bg sm:h-7 sm:w-7">
                    {group.badge}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-site-display text-[1.25rem] font-medium leading-tight sm:text-[1.5rem]">
                  {group.name}
                </span>
                {group.shopName && (
                  <span
                    className={`block truncate font-site-display text-sm italic sm:text-base ${active ? "opacity-90" : "text-site-accent"}`}
                  >
                    {group.shopName}
                  </span>
                )}
                {group.subtitle && (
                  <span
                    className={`block truncate text-xs sm:text-sm ${active ? "opacity-80" : "text-site-muted"}`}
                  >
                    {group.subtitle}
                  </span>
                )}
              </span>
              <span
                aria-hidden="true"
                className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full sm:right-3 sm:h-7 sm:w-7 ${
                  active ? "bg-site-bg/20 text-site-bg" : "bg-site-button text-site-on-button"
                }`}
              >
                {active ? <CheckIcon /> : <ArrowIcon />}
              </span>
            </button>
          );
        })}
      </div>
      <div key={selected ?? "none"}>{grid(cards.filter((card) => card.businessId === selected))}</div>
    </div>
  );
}
