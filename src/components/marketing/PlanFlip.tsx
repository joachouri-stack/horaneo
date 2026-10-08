"use client";

import { type ReactNode, useState } from "react";
import { BrowserIcon, CalendarCheckIcon } from "./icons";

type Side = "booking" | "site";

/**
 * Interrupteur des packs : « avec réservation » / « site seul ». Il retourne
 * toutes les cartes (rendues côté serveur) en changeant l'attribut data-side.
 */
export function PlanFlip({
  labels,
  children,
}: {
  labels: {
    group: string;
    booking: string;
    site: string;
    hintBooking: string;
    hintSite: string;
  };
  children: ReactNode;
}) {
  const [side, setSide] = useState<Side>("booking");
  const option = (value: Side, text: string, Icon: typeof BrowserIcon) => (
    <button
      type="button"
      aria-pressed={side === value}
      onClick={() => setSide(value)}
      className={`relative z-10 flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[0.9rem] font-semibold transition-colors duration-300 sm:px-6 sm:text-[0.95rem] ${
        side === value ? "text-white" : "text-stone hover:text-night"
      }`}
    >
      <Icon className="size-[18px] flex-none" />
      {text}
    </button>
  );
  return (
    <div data-side={side} className="group/plans">
      <div className="mb-6 flex flex-col items-center gap-2.5 lg:mb-10">
        {/* Deux options de même largeur ; une pastille bleu nuit glisse sous l'option choisie. */}
        <div
          role="group"
          aria-label={labels.group}
          className="relative grid grid-cols-2 rounded-full border-2 border-line bg-white p-1 shadow-[0_10px_30px_-14px_rgba(22,24,29,.25)]"
        >
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-navy shadow-[0_8px_18px_rgba(27,42,74,.3)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
              side === "site" ? "translate-x-full" : ""
            }`}
          />
          {option("booking", labels.booking, CalendarCheckIcon)}
          {option("site", labels.site, BrowserIcon)}
        </div>
        <p className="text-center text-sm text-stone" aria-live="polite">
          {side === "booking" ? labels.hintBooking : labels.hintSite}
        </p>
      </div>
      {children}
    </div>
  );
}
