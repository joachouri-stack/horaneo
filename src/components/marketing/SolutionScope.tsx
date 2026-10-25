"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { CalendarLine, CapLine, StoreLine } from "./line-icons";

type Solution = "booking" | "commerce" | "formation";

type Billing = "month" | "year";

const Context = createContext<{
  solution: Solution;
  choose: (solution: Solution) => void;
  billing: Billing;
  setBilling: (billing: Billing) => void;
} | null>(null);

/**
 * Solution choisie (Réservation, Commerce, Formation) : posée sur la page
 * en data-solution. Couleur d'accent, textes, visuels et lignes du
 * comparatif propres à chaque solution suivent (CSS : [data-only]). Les
 * contenus sont rendus côté serveur : changer de solution est instantané.
 */
export function SolutionScope({
  children,
  initial = "booking",
}: {
  children: ReactNode;
  initial?: Solution;
}) {
  const [solution, setSolution] = useState<Solution>(initial);
  // Prix affichés : mensuels ou annuels (cartes, comparatif, liens vers la commande).
  const [billing, setBilling] = useState<Billing>("month");
  const [switched, setSwitched] = useState(false);
  const choose = (next: Solution) => {
    setSolution(next);
    setSwitched(true);
  };
  return (
    <Context.Provider value={{ solution, choose, billing, setBilling }}>
      <div data-solution={solution} data-switched={switched} data-billing={billing}>
        {children}
      </div>
    </Context.Provider>
  );
}

const ICONS = { booking: CalendarLine, commerce: StoreLine, formation: CapLine } as const;

/** Les trois cartes de choix (vrais boutons, utilisables au clavier). */
export function SolutionTabs({
  items,
  label,
  soonLabel,
}: {
  items: { code: Solution; name: string; short: string; soon: boolean }[];
  label: string;
  soonLabel: string;
}) {
  const context = useContext(Context);
  if (!context) return null;
  return (
    <div role="group" aria-label={label} className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      {items.map((item) => {
        const Icon = ICONS[item.code];
        const active = context.solution === item.code;
        return (
          <button
            key={item.code}
            type="button"
            aria-pressed={active}
            onClick={() => context.choose(item.code)}
            data-solution={item.code}
            className={`group flex min-h-[4.75rem] items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition duration-300 motion-reduce:transition-none ${
              active
                ? "border-transparent bg-accent text-white shadow-[0_18px_36px_-20px_var(--accent)]"
                : "border-hairline bg-white text-night hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[0_14px_30px_-22px_rgba(15,24,48,.4)]"
            }`}
          >
            <span
              className={`flex size-11 flex-none items-center justify-center rounded-xl transition ${
                active ? "bg-white/15 text-white" : "bg-accent-soft text-accent"
              }`}
            >
              <Icon className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-display text-[1.05rem] font-semibold tracking-[-0.01em]">
                  {item.name}
                </span>
                {item.soon && (
                  <span
                    className={`rounded-full px-2 py-px text-[0.68rem] font-medium ${
                      active ? "bg-white/15 text-white" : "bg-mist-50 text-ink-soft"
                    }`}
                  >
                    {soonLabel}
                  </span>
                )}
              </span>
              <span
                className={`block text-[0.83rem] leading-snug ${active ? "text-white/80" : "text-ink-soft"}`}
              >
                {item.short}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Sélecteur de pack du comparatif sur téléphone (une colonne à la fois). */
export function PackColumns({
  packs,
  label,
  children,
}: {
  packs: string[];
  label: string;
  children: ReactNode;
}) {
  const [pack, setPack] = useState(Math.min(1, packs.length - 1));
  return (
    <div data-pack={pack}>
      <div
        role="group"
        aria-label={label}
        className="mb-4 grid grid-flow-col gap-1 rounded-xl bg-mist-50 p-1 md:hidden"
      >
        {packs.map((name, index) => (
          <button
            key={name}
            type="button"
            aria-pressed={pack === index}
            onClick={() => setPack(index)}
            className={`min-h-11 rounded-lg text-[0.9rem] font-medium transition ${
              pack === index
                ? "bg-white text-night shadow-[0_2px_8px_-4px_rgba(15,24,48,.3)]"
                : "text-ink-soft"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Mensuel / Annuel : bascule tous les prix de la page (les mois offerts sont annoncés). */
export function BillingToggle({
  labels,
}: {
  labels: { group: string; month: string; year: string; badge: string | null };
}) {
  const context = useContext(Context);
  if (!context) return null;
  const option = (value: Billing, text: string) => (
    <button
      type="button"
      aria-pressed={context.billing === value}
      onClick={() => context.setBilling(value)}
      className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-[0.88rem] font-medium transition ${
        context.billing === value
          ? "bg-white text-night shadow-[0_2px_8px_-4px_rgba(15,24,48,.35)]"
          : "text-ink-soft hover:text-night"
      }`}
    >
      {text}
      {value === "year" && labels.badge && (
        <span className="rounded-full bg-accent px-2 py-px text-[0.7rem] font-medium text-white">
          {labels.badge}
        </span>
      )}
    </button>
  );
  return (
    <div role="group" aria-label={labels.group} className="inline-flex rounded-full bg-accent-soft p-1">
      {option("month", labels.month)}
      {option("year", labels.year)}
    </div>
  );
}
