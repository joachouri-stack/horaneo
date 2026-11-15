"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/actions/result";

export type PaletteOption = {
  value: string;
  label: string;
  primary: string;
  secondary: string;
  /** Bouton tel qu'il apparaît sur le site (contraste corrigé). */
  button: string;
  onButton: string;
};

/** Couleurs du site : un clic sur une palette l'applique tout de suite. */
export function PaletteChooser({
  tenantId,
  options,
  selected,
  sampleLabel,
  doneLabel,
  action,
}: {
  tenantId: string;
  options: PaletteOption[];
  selected: string | null;
  sampleLabel: string;
  doneLabel: string;
  action: (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
}) {
  const tErrors = useTranslations("errors");
  const [current, setCurrent] = useState(selected);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(value: string) {
    if (pending || value === current) return;
    const previous = current;
    setCurrent(value);
    setMessage(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("tenantId", tenantId);
      data.set("palette", value);
      const result = await action(null, data);
      if (result.ok) setMessage({ ok: true, text: doneLabel });
      else {
        setCurrent(previous);
        setMessage({ ok: false, text: tErrors(result.error) });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" className="grid gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current === option.value}
            disabled={pending}
            onClick={() => choose(option.value)}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-hairline bg-white p-2.5 text-left transition hover:border-navy/30 aria-checked:border-night aria-checked:ring-2 aria-checked:ring-night/15 disabled:cursor-wait"
          >
            <span aria-hidden="true" className="flex flex-none items-center -space-x-1.5">
              <span
                className="size-7 rounded-full border-2 border-white"
                style={{ background: option.primary }}
              />
              <span
                className="size-7 rounded-full border-2 border-white"
                style={{ background: option.secondary }}
              />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-night">{option.label}</span>
            <span
              aria-hidden="true"
              className="rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ background: option.button, color: option.onButton }}
            >
              {sampleLabel}
            </span>
          </button>
        ))}
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? ui.success : ui.error}>
          {message.text}
        </p>
      )}
    </div>
  );
}
