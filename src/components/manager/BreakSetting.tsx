"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveBreakAction } from "@/app/(platform)/[locale]/espace/[tenantId]/actions";

/**
 * Réglage rapide de l'agenda : pause gardée libre après chaque rendez-vous (souffler,
 * nettoyer le matériel). Un choix, enregistré tout de suite.
 */
export function BreakSetting({
  tenantId,
  value,
  options,
}: {
  tenantId: string;
  value: number;
  options: readonly number[];
}) {
  const t = useTranslations("manager.agenda.breakSetting");
  const tSettings = useTranslations("manager.settings");
  const tErrors = useTranslations("errors");
  const [current, setCurrent] = useState(value);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const label = (minutes: number) =>
    minutes === 0
      ? t("none")
      : minutes % 60 === 0
        ? tSettings("breakHours", { count: minutes / 60 })
        : tSettings("minutes", { count: minutes });

  const choose = (minutes: number) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveBreakAction(tenantId, minutes);
      if (!result.ok) {
        setMessage(tErrors(result.error));
        return;
      }
      setCurrent(minutes);
      setOpen(false);
      setMessage(minutes === 0 ? t("savedNone") : t("saved", { value: label(minutes) }));
    });
  };

  return (
    <div className="rounded-xl border border-hairline bg-white px-3.5 py-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center gap-2 text-left text-[0.9375rem] text-night"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5 shrink-0 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" />
        </svg>
        <span className="min-w-0 flex-1">
          {t("label")} : <strong className="font-semibold">{label(current)}</strong>
        </span>
        <span className="text-sm font-medium text-accent underline">{t("change")}</span>
      </button>
      {open && (
        <div className="pb-2 pt-1">
          <p className="mb-2 text-sm text-ink-soft">{t("hint")}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={pending}
                onClick={() => choose(minutes)}
                aria-pressed={current === minutes}
                className="min-h-10 rounded-full border border-hairline px-3.5 text-[0.9375rem] font-medium text-night transition hover:border-accent-line aria-pressed:border-night aria-pressed:bg-night aria-pressed:text-white disabled:opacity-60"
              >
                {label(minutes)}
              </button>
            ))}
          </div>
        </div>
      )}
      {message && (
        <p role="status" className="pb-1 text-sm text-ink-soft">
          {message}
        </p>
      )}
    </div>
  );
}
