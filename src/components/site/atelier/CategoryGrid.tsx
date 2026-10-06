"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ArrowIcon, CategoryIcon } from "./icons";

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
  /** « Avec Laïla ». */
  title: string;
  /** Spécialité affichée sous le titre (facultative). */
  subtitle: string;
  /** Photo ronde (rendue côté serveur) ; sinon l'initiale. */
  avatar: ReactNode | null;
  initial: string;
};

/**
 * Catégories de l'accueil, en cartes toutes de même taille (nom, nombre de
 * prestations, description, prix de départ). Sur un site à plusieurs
 * professionnelles, elles sont rangées par professionnelle, sous un petit
 * titre : tout reste visible, personne n'est caché derrière un filtre.
 */
export function CategoryGrid({
  cards,
  groups,
  labels,
}: {
  cards: CategoryCard[];
  groups: CategoryGroup[];
  labels: { see: string; speciality: string };
}) {
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
  }, []);

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
  if (groups.length < 2) return <div ref={rootRef}>{grid(cards)}</div>;

  return (
    <div ref={rootRef} className="mt-8 space-y-12">
      {groups.map((group) => {
        const list = cards.filter((card) => card.businessId === group.id);
        if (list.length === 0) return null;
        return (
          <section key={group.id} aria-labelledby={`pro-${group.id}`}>
            <div className="flex items-center gap-4 border-b border-site-border pb-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-site-surface font-site-display text-2xl text-site-accent ring-2 ring-site-card">
                {group.avatar ?? group.initial}
              </span>
              <div className="min-w-0">
                <h3
                  id={`pro-${group.id}`}
                  className="font-site-display text-[1.75rem] font-medium leading-tight"
                >
                  {group.title}
                </h3>
                {group.subtitle && <p className="text-sm text-site-muted">{group.subtitle}</p>}
              </div>
            </div>
            {grid(list)}
          </section>
        );
      })}
    </div>
  );
}
