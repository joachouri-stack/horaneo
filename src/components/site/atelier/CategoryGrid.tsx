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
  /** Texte du lien pour les lecteurs d'écran. */
  ariaLabel: string;
  priceLabel: string;
  href: string;
};

export type CategoryFilter = {
  id: string;
  label: string;
  /** Nombre de soins, en pastille. */
  count: number;
  /** Photo ronde (rendue côté serveur) ; sinon l'initiale. */
  avatar: ReactNode | null;
};

/**
 * Catégories de l'accueil : des pastilles simples pour choisir la
 * professionnelle, puis des cartes toutes de même taille (nom, description,
 * prix de départ, « Voir les soins »), faciles à parcourir sur téléphone.
 */
export function CategoryGrid({
  cards,
  filters,
  allCount,
  labels,
}: {
  cards: CategoryCard[];
  filters: CategoryFilter[];
  allCount: number;
  labels: { all: string; filter: string; see: string; speciality: string };
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const visible = cards.filter((card) => !filter || card.businessId === filter);
  // Téléphone et tablette (pas de survol possible) : la carte qui passe au
  // milieu de l'écran pendant le défilement ressort, comme au survol sur ordinateur.
  const listRef = useRef<HTMLUListElement>(null);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !window.matchMedia("(hover: none)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const centered = entries.filter((entry) => entry.isIntersecting);
        if (centered.length > 0) setSpotlight((centered[0].target as HTMLElement).dataset.card ?? null);
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    list.querySelectorAll<HTMLElement>("[data-card]").forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [filter]);
  const options = [
    { id: null as string | null, label: labels.all, count: allCount, avatar: null },
    ...filters,
  ];
  return (
    <>
      {filters.length > 1 && (
        <div
          role="group"
          aria-label={labels.filter}
          className="-mx-4 mt-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {options.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pr-4 text-[0.95rem] font-semibold transition-colors duration-200 ${
                  item.avatar ? "pl-1.5" : "pl-4"
                } ${
                  active
                    ? "border-site-text bg-site-text text-site-bg"
                    : "border-site-border bg-site-card text-site-text hover:border-site-accent"
                }`}
              >
                {item.avatar && (
                  <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full">{item.avatar}</span>
                )}
                {item.label}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${active ? "bg-white/20" : "bg-site-surface text-site-accent"}`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ul ref={listRef} key={filter ?? "all"} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((card, index) => (
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
                    {card.withLabel}
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
    </>
  );
}
