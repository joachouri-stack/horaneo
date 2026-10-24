"use client";

import { useInstallPrompt } from "@/components/install/useInstallPrompt";

/**
 * Carte de l'écran « Aujourd'hui », sur téléphone : propose d'installer
 * l'espace comme une application (icône sur l'écran d'accueil, notifications
 * sur iPhone). Android : en un geste ; iPhone : la marche à suivre.
 * Cachée si déjà installée ; « Plus tard » la cache 7 jours sur cet appareil.
 */
export function InstallAppCard({
  iconUrl,
  labels,
}: {
  iconUrl: string;
  labels: { title: string; text: string; install: string; later: string; iosHowTo: string };
}) {
  const { mode, showSteps, install, later } = useInstallPrompt({
    delayMs: 0,
    dismissKey: "manager-install-dismissed-until",
    dismissDays: 7,
  });
  if (mode === "hidden") return null;
  return (
    <aside
      aria-labelledby="installer-application"
      className="flex items-start gap-3 rounded-[var(--radius-card)] border-2 border-coral/30 bg-white p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- icône générée, déjà à la bonne taille */}
      <img src={iconUrl} alt="" width={44} height={44} className="size-11 shrink-0 rounded-[0.7rem]" />
      <div className="min-w-0 flex-1">
        <h2 id="installer-application" className="font-bold text-night">
          {labels.title}
        </h2>
        <p className="mt-0.5 text-sm text-ink/80">{labels.text}</p>
        {showSteps ? (
          <p className="mt-2 rounded-xl bg-blush p-3 text-sm text-night">{labels.iosHowTo}</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            <button
              type="button"
              onClick={install}
              className="inline-flex min-h-11 items-center font-semibold text-coral-dark underline underline-offset-4"
            >
              {labels.install} →
            </button>
            <button
              type="button"
              onClick={later}
              className="inline-flex min-h-11 items-center text-sm text-ink/70 underline"
            >
              {labels.later}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
