"use client";

import { type ReactNode, useState } from "react";

type Side = "booking" | "site";

/**
 * Interrupteur des packs : « avec réservation » / « site seul ». Il retourne
 * toutes les cartes (rendues côté serveur) en changeant l'attribut data-side.
 */
export function PlanFlip({
  labels,
  children,
}: {
  labels: { group: string; booking: string; site: string; hintBooking: string; hintSite: string };
  children: ReactNode;
}) {
  const [side, setSide] = useState<Side>("booking");
  const option = (value: Side, text: string) => (
    <button
      type="button"
      aria-pressed={side === value}
      onClick={() => setSide(value)}
      className={`min-h-11 rounded-full px-4 py-2.5 text-[0.95rem] font-semibold transition sm:px-6 ${
        side === value
          ? "bg-night text-white shadow-[0_8px_18px_rgba(22,24,29,.18)]"
          : "text-stone hover:text-night"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div data-side={side} className="group/plans">
      <div className="mb-10 flex flex-col items-center gap-2.5">
        <div
          role="group"
          aria-label={labels.group}
          className="inline-flex gap-1 rounded-full border-2 border-line bg-white p-1"
        >
          {option("booking", labels.booking)}
          {option("site", labels.site)}
        </div>
        <p className="text-center text-sm text-stone" aria-live="polite">
          {side === "booking" ? labels.hintBooking : labels.hintSite}
        </p>
      </div>
      {children}
    </div>
  );
}
