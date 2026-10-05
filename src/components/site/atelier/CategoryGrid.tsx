"use client";

import Link from "next/link";
import { useState } from "react";
import { CategoryIcon, PlusIcon } from "./icons";

export type CategoryCard = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  featured: boolean;
  businessId: string;
  businessName: string;
  priceLabel: string;
  href: string;
};

/**
 * Cartes des catégories de l'accueil, filtrables par professionnelle.
 * Les catégories mises en avant occupent deux colonnes, en couleur.
 */
export function CategoryGrid({
  cards,
  filters,
  labels,
}: {
  cards: CategoryCard[];
  filters: { id: string; label: string }[];
  labels: { all: string; filter: string; see: string };
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const visible = cards.filter((card) => !filter || card.businessId === filter);
  // Sur téléphone (deux colonnes), une carte qui resterait seule sur sa ligne
  // prend toute la largeur : pas de trou dans la grille.
  const alone = new Set<string>();
  let column = 0;
  visible.forEach((card, index) => {
    if (card.featured) {
      column = 0;
      return;
    }
    const next = visible[index + 1];
    if (column === 0 && (!next || next.featured)) alone.add(card.id);
    column = column === 0 && !alone.has(card.id) ? 1 : 0;
  });
  let featuredIndex = 0;
  return (
    <>
      {filters.length > 1 && (
        <div role="group" aria-label={labels.filter} className="flex flex-wrap gap-2 sm:justify-end">
          {[{ id: null as string | null, label: labels.all }, ...filters].map((item) => (
            <button
              key={item.id ?? "all"}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className="min-h-10 rounded-full border border-site-border bg-site-card px-4 text-sm font-semibold text-site-text aria-pressed:border-site-text aria-pressed:bg-site-text aria-pressed:text-site-bg"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {visible.map((card) => {
          // Mises en avant : la première en couleur d'accent, la suivante en brun.
          const tone = card.featured ? (featuredIndex++ % 2 === 0 ? "accent" : "deep") : "plain";
          const colors =
            tone === "accent"
              ? "bg-site-button text-site-on-button"
              : tone === "deep"
                ? "bg-site-text text-site-bg"
                : "bg-site-card text-site-text";
          return (
            <li
              key={card.id}
              className={card.featured ? "col-span-2" : alone.has(card.id) ? "col-span-2 lg:col-span-1" : ""}
            >
              <Link
                href={card.href}
                aria-label={`${labels.see} ${card.name}`}
                className={`group flex h-full min-h-48 flex-col rounded-[1.5rem] p-4 sm:min-h-56 sm:p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgba(0,0,0,0.3)] ${colors}`}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone === "plain" ? "bg-site-surface text-site-accent" : "bg-white/15"}`}
                  >
                    <CategoryIcon icon={card.icon} />
                  </span>
                  {filters.length > 1 && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone === "plain" ? "bg-site-surface text-site-text" : "bg-white/15"}`}
                    >
                      {card.businessName}
                    </span>
                  )}
                </div>
                <h3
                  className={`mt-4 font-site-display font-medium leading-tight ${card.featured ? "text-3xl" : "text-2xl"}`}
                >
                  {card.name}
                </h3>
                {card.description && <p className="mt-2 text-sm opacity-80">{card.description}</p>}
                <div className="mt-auto flex items-end justify-between pt-5">
                  <span className="text-sm font-bold">{card.priceLabel}</span>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition group-hover:scale-110 ${tone === "plain" ? "bg-site-surface text-site-accent" : "bg-white/20"}`}
                  >
                    <PlusIcon />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
