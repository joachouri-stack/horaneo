"use client";

import { useInstallPrompt } from "@/components/install/useInstallPrompt";

const DISMISS_KEY = "install-app-dismissed-until";
const DISMISS_DAYS = 7;
/** Pas dès l'arrivée : quelques secondes pour découvrir la page d'abord. */
const SHOW_AFTER_MS = 5_000;

/**
 * Bandeau du site d'un établissement, sur téléphone seulement : propose
 * d'installer le site comme une application (icône sur l'écran d'accueil).
 * Il apparaît 5 secondes après l'arrivée. Android : installation en un
 * geste ; iPhone : la marche à suivre (Partager → « Sur l'écran d'accueil »).
 * Caché si déjà installé ou refusé (7 jours).
 * Variante « inline » (après une réservation) : un encadré dans la page,
 * affiché tout de suite, même si le bandeau a été refusé.
 */
export function InstallAppBanner({
  iconUrl,
  labels,
  inline = false,
}: {
  iconUrl: string;
  inline?: boolean;
  labels: { title: string; text: string; install: string; later: string; iosHowTo: string; close: string };
}) {
  const { mode, showSteps, install, later } = useInstallPrompt({
    delayMs: inline ? 0 : SHOW_AFTER_MS,
    dismissKey: DISMISS_KEY,
    dismissDays: DISMISS_DAYS,
    ignoreDismissed: inline,
  });

  if (mode === "hidden") return null;
  const headingId = inline ? "installer-application-rdv" : "installer-application";

  return (
    <aside
      aria-labelledby={headingId}
      className={
        inline
          ? "mt-6 rounded-site border border-site-border bg-site-card p-4 text-site-text sm:hidden"
          : "fixed inset-x-3 bottom-[5.75rem] z-40 rounded-site border border-site-border bg-site-card p-4 text-site-text shadow-xl sm:hidden"
      }
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône générée, déjà à la bonne taille */}
        <img src={iconUrl} alt="" width={48} height={48} className="size-12 shrink-0 rounded-[0.8rem]" />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-semibold">
            {labels.title}
          </h2>
          <p className="mt-0.5 text-sm text-site-muted">{labels.text}</p>
        </div>
        <button
          type="button"
          onClick={later}
          aria-label={labels.close}
          className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center text-site-muted"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {showSteps ? (
        <p className="mt-3 rounded-site bg-site-surface p-3 text-sm">{labels.iosHowTo}</p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={install}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-site bg-site-button px-4 font-semibold text-site-on-button"
          >
            {labels.install}
          </button>
          <button
            type="button"
            onClick={later}
            className="inline-flex min-h-11 items-center px-2 text-sm underline"
          >
            {labels.later}
          </button>
        </div>
      )}
    </aside>
  );
}
