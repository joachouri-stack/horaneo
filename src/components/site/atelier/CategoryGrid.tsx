"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
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
      <ul key={filter ?? "all"} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((card, index) => (
          <li
            key={card.id}
            style={{ animationDelay: `${index * 50}ms` }}
            className="motion-safe:animate-[card-in_.45s_ease-out_both]"
          >
            <Link
              href={card.href}
              aria-label={card.ariaLabel}
              className="group flex h-full flex-col rounded-[1.5rem] border border-site-border bg-site-card p-4 transition duration-300 hover:-translate-y-1 hover:border-site-accent hover:shadow-[0_18px_36px_-20px_rgba(0,0,0,0.35)] sm:p-6"
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-site-surface text-site-accent sm:h-12 sm:w-12">
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
                <span className="text-lg font-bold text-site-accent">{card.priceLabel}</span>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="max-sm:sr-only">{labels.see}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-site-surface text-site-accent transition group-hover:translate-x-1 group-hover:bg-site-button group-hover:text-site-on-button">
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
