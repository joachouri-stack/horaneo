"use client";

import Link from "next/link";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
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

export type CategoryFilter = {
  id: string;
  label: string;
  /** Spécialité (ou nombre de soins), sous le nom. */
  detail: string;
  /** Nombre de soins ajouté à la spécialité, sauf sur téléphone (place). */
  count?: string;
  /** Photo ronde (rendue côté serveur) ; sinon l'initiale. */
  avatar: ReactNode | null;
};

/**
 * Cartes des catégories de l'accueil, filtrables par professionnelle.
 * Le choix se fait dans un sélecteur bien visible (photo, nom, spécialité) dont
 * le fond glisse vers l'option choisie ; les cartes apparaissent en douceur.
 * Les catégories mises en avant occupent deux colonnes, en couleur.
 */
export function CategoryGrid({
  cards,
  filters,
  labels,
}: {
  cards: CategoryCard[];
  filters: CategoryFilter[];
  labels: { all: string; allDetail: string; filter: string; see: string };
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const options = [
    { id: null as string | null, label: labels.all, detail: labels.allDetail, avatar: null },
    ...filters,
  ];
  // Fond qui glisse sous l'option choisie (position mesurée, suit le redimensionnement).
  const switcher = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const box = switcher.current;
    if (!box) return;
    const measure = () => {
      const active = box.querySelector<HTMLElement>("[aria-pressed=true]");
      if (active)
        setPill({
          left: active.offsetLeft,
          top: active.offsetTop,
          width: active.offsetWidth,
          height: active.offsetHeight,
        });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [filter]);
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
        <p id="choix-pro" className="mt-8 text-sm font-semibold uppercase tracking-wider text-site-muted">
          {labels.filter}
        </p>
      )}
      {filters.length > 1 && (
        <div
          ref={switcher}
          role="group"
          aria-labelledby="choix-pro"
          className="relative mt-3 flex gap-1.5 overflow-x-auto rounded-[1.75rem] border border-site-border bg-site-card p-1.5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)] sm:inline-flex sm:max-w-full"
        >
          {pill && (
            <span
              aria-hidden="true"
              className="absolute rounded-[1.4rem] bg-site-text shadow-[0_12px_24px_-12px_rgba(0,0,0,0.5)] transition-all duration-500 ease-[cubic-bezier(.2,.9,.25,1.15)] motion-reduce:transition-none"
              style={pill}
            />
          )}
          {options.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={`group/pro relative z-10 flex min-w-[6.5rem] flex-1 flex-col items-center gap-2 rounded-[1.4rem] px-3 py-3 text-center transition-colors duration-300 sm:min-w-0 sm:flex-none sm:flex-row sm:gap-3 sm:py-2.5 sm:pl-2.5 sm:pr-5 sm:text-left ${
                  active ? "text-site-bg" : "text-site-text hover:bg-site-surface"
                }`}
              >
                <span
                  className={`relative flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full ring-2 transition duration-300 group-hover/pro:scale-105 ${
                    active ? "ring-site-bg/70" : "ring-site-border"
                  } ${item.avatar ? "" : active ? "bg-white/15" : "bg-site-surface text-site-accent"}`}
                >
                  {item.avatar ??
                    (item.id === null ? (
                      <CategoryIcon icon="sparkles" />
                    ) : (
                      <span className="font-site-display text-xl">{item.label.charAt(0)}</span>
                    ))}
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-nowrap font-semibold leading-tight">{item.label}</span>
                  <span
                    className={`mt-0.5 block whitespace-nowrap text-xs transition-colors duration-300 ${active ? "opacity-80" : "text-site-muted"}`}
                  >
                    {item.detail}
                    {"count" in item && item.count && <span className="max-sm:hidden"> · {item.count}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <ul key={filter ?? "all"} className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {visible.map((card, index) => {
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
              style={{ animationDelay: `${index * 60}ms` }}
              className={`motion-safe:animate-[card-in_.5s_ease-out_both] ${card.featured ? "col-span-2" : alone.has(card.id) ? "col-span-2 lg:col-span-1" : ""}`}
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
