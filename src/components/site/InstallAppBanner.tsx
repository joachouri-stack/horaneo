"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "install-app-dismissed-until";
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 4000;

/**
 * Bandeau du site d'un établissement, sur téléphone seulement : propose
 * d'installer le site comme une application (icône sur l'écran d'accueil).
 * Android : installation en un geste ; iPhone : la marche à suivre (Partager →
 * « Sur l'écran d'accueil »). Caché si déjà installé ou refusé (30 jours).
 */
export function InstallAppBanner({
  iconUrl,
  labels,
}: {
  iconUrl: string;
  labels: { title: string; text: string; install: string; later: string; iosHowTo: string; close: string };
}) {
  const [mode, setMode] = useState<"hidden" | "android" | "ios">("hidden");
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const phone = window.matchMedia("(max-width: 639px)").matches;
    let dismissed = false;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
    } catch {
      // Stockage indisponible (navigation privée) : on propose quand même.
    }
    if (installed || !phone || dismissed) return;
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (ios) {
      timer = setTimeout(() => setMode("ios"), SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    // Android (Chrome, Edge, Samsung…) : le navigateur signale que l'installation est possible.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
      timer = setTimeout(() => setMode("android"), SHOW_AFTER_MS);
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 3600 * 1000));
    } catch {
      // Sans stockage, le bandeau reviendra à la prochaine visite.
    }
    setMode("hidden");
  };

  const install = async () => {
    if (mode === "ios") {
      setShowSteps(true);
      return;
    }
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    if (choice.outcome === "accepted") setMode("hidden");
    else later();
  };

  return (
    <aside
      aria-labelledby="installer-application"
      className="fixed inset-x-3 bottom-[5.75rem] z-40 rounded-site border border-site-border bg-site-card p-4 text-site-text shadow-xl sm:hidden"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- icône générée, déjà à la bonne taille */}
        <img src={iconUrl} alt="" width={48} height={48} className="size-12 shrink-0 rounded-[0.8rem]" />
        <div className="min-w-0 flex-1">
          <h2 id="installer-application" className="font-semibold">
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
