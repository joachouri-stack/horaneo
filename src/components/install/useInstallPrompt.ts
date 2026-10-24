"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type InstallWindow = Window & { __installPrompt?: InstallPrompt | null };

export type InstallMode = "hidden" | "android" | "ios";

export function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Proposer d'installer le site comme une application, sur téléphone seulement.
 * Android : l'offre du navigateur (gardée par `InstallCapture`), en un geste ;
 * iPhone : la marche à suivre. Caché si déjà installé ou refusé (`dismissKey`,
 * `dismissDays` jours) ; `ignoreDismissed` : proposé même après un refus.
 */
export function useInstallPrompt({
  delayMs,
  dismissKey,
  dismissDays,
  ignoreDismissed = false,
}: {
  delayMs: number;
  dismissKey: string;
  dismissDays: number;
  ignoreDismissed?: boolean;
}) {
  const [mode, setMode] = useState<InstallMode>("hidden");
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const phone = window.matchMedia("(max-width: 639px)").matches;
    let dismissed = false;
    try {
      dismissed = Number(localStorage.getItem(dismissKey) ?? 0) > Date.now();
    } catch {
      // Stockage indisponible (navigation privée) : on propose quand même.
    }
    if (isInstalled() || !phone || (dismissed && !ignoreDismissed)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (next: InstallMode) => {
      clearTimeout(timer);
      timer = setTimeout(() => setMode(next), delayMs);
    };
    if (isIos()) {
      show("ios");
      return () => clearTimeout(timer);
    }
    // Android (Chrome, Edge, Samsung…) : le navigateur signale que l'installation est possible.
    const win = window as InstallWindow;
    const onReady = () => {
      if (win.__installPrompt) show("android");
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      win.__installPrompt = event as InstallPrompt;
      show("android");
    };
    const onInstalled = () => {
      clearTimeout(timer);
      setMode("hidden");
    };
    onReady();
    window.addEventListener("install-prompt-ready", onReady);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("install-prompt-ready", onReady);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [delayMs, dismissKey, ignoreDismissed]);

  const later = () => {
    if (!ignoreDismissed) {
      try {
        localStorage.setItem(dismissKey, String(Date.now() + dismissDays * 24 * 3600 * 1000));
      } catch {
        // Sans stockage, la proposition reviendra à la prochaine visite.
      }
    }
    setMode("hidden");
  };

  const install = async () => {
    if (mode === "ios") {
      setShowSteps(true);
      return;
    }
    const win = window as InstallWindow;
    const prompt = win.__installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    // L'offre ne sert qu'une fois.
    win.__installPrompt = null;
    if (choice.outcome === "accepted") setMode("hidden");
    else later();
  };

  return { mode, showSteps, install, later };
}
