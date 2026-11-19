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
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const label = (minutes: number) =>
    minutes === 0
      ? t("none")
      : minutes % 60 === 0
        ? tSettings("breakHours", { count: minutes / 60 })
        : tSettings("minutes", { count: minutes });

  /** Libellé court des boutons (« 5 min », « 1 h ») : tous sur deux lignes égales. */
  const short = (minutes: number) =>
    minutes === 0
      ? t("none")
      : minutes % 60 === 0
        ? t("hoursShort", { count: minutes / 60 })
        : t("minutesShort", { count: minutes });

  // Exemple concret : fin d'un rendez-vous à 10:30, plus la pause.
  const exampleEnd = 10 * 60 + 30 + current;
  const next = `${String(Math.floor(exampleEnd / 60)).padStart(2, "0")}:${String(exampleEnd % 60).padStart(2, "0")}`;

  const choose = (minutes: number) => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveBreakAction(tenantId, minutes);
      if (!result.ok) {
        setMessage({ text: tErrors(result.error), error: true });
        return;
      }
      setCurrent(minutes);
      setOpen(false);
      setMessage({
        text: minutes === 0 ? t("savedNone") : t("saved", { value: label(minutes) }),
        error: false,
      });
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
        <span className="text-sm font-medium text-accent underline">{open ? t("close") : t("change")}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-hairline pb-2 pt-3">
          <p className="text-sm text-ink-soft">{t("hint")}</p>
          <div className="grid grid-cols-4 gap-2">
            {options.map((minutes) => (
              <button
                key={minutes}
                type="button"
                disabled={pending}
                onClick={() => choose(minutes)}
                aria-pressed={current === minutes}
                aria-label={label(minutes)}
                className="min-h-11 rounded-xl border border-hairline bg-white px-1 text-[0.9375rem] font-medium text-night tabular-nums transition hover:border-accent aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-white disabled:opacity-60"
              >
                {short(minutes)}
              </button>
            ))}
          </div>
          <p className="rounded-lg bg-mist-50 px-3 py-2 text-sm text-ink-soft">{t("example", { next })}</p>
        </div>
      )}
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`flex items-center gap-1.5 pb-1 text-sm font-medium ${message.error ? "text-[#8f2a20]" : "text-success"}`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d={
                message.error
                  ? "M12 8v5M12 16.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"
                  : "M5 12.5l4.5 4.5L19 7.5"
              }
            />
          </svg>
          {message.text}
        </p>
      )}
    </div>
  );
}
