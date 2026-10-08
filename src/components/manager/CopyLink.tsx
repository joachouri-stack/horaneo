"use client";

import { useState } from "react";
import { ui } from "@/components/ui/styles";

/** Lien à copier (agenda du téléphone…) : champ en lecture seule et bouton « Copier ». */
export function CopyLink({
  value,
  label,
  copyLabel,
  copiedLabel,
}: {
  value: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copie refusée par le navigateur : le lien reste sélectionnable à la main.
    }
  };
  return (
    <div className="space-y-2">
      <label htmlFor="calendar-link" className="font-semibold text-night">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id="calendar-link"
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className={`${ui.input} w-auto min-w-0 flex-1 text-sm`}
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-blush px-5 font-semibold text-rust transition hover:bg-blush-strong"
          aria-live="polite"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
    </div>
  );
}
