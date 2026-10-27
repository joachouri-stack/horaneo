"use client";

import { useState } from "react";

/** Bouton « Copier » (clé de double vérification, codes de secours…). */
export function CopyButton({
  value,
  label,
  copiedLabel,
}: {
  value: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copie refusée par le navigateur : le texte reste sélectionnable à la main.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-hairline bg-white px-4 font-medium text-night transition hover:border-accent-line hover:text-accent"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
