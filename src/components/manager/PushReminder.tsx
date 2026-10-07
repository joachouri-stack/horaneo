"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

const DISMISS_KEY = "push-reminder-dismissed-until";
const DISMISS_DAYS = 30;

/**
 * Petite carte de l'écran « Aujourd'hui » : tant que les notifications ne
 * sont pas activées sur cet appareil, elle invite à le faire (page
 * Notifications). « Plus tard » la cache 30 jours sur cet appareil.
 */
export function PushReminder({
  href,
  labels,
}: {
  href: string;
  labels: { title: string; text: string; action: string; later: string };
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now()) return false;
      } catch {
        // Stockage indisponible (navigation privée) : la carte s'affiche quand même.
      }
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      // Sur iPhone hors écran d'accueil, la page Notifications explique comment faire.
      if (!supported) return ios;
      if (Notification.permission === "denied") return false;
      const registration = await navigator.serviceWorker.getRegistration();
      return !(await registration?.pushManager.getSubscription());
    };
    check()
      .catch(() => false)
      .then((show) => {
        if (!cancelled) setVisible(show);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 3600 * 1000));
    } catch {
      // Sans stockage, la carte reviendra à la prochaine visite.
    }
    setVisible(false);
  };

  return (
    <aside
      aria-labelledby="rappel-notifications"
      className="flex items-start gap-3 rounded-[var(--radius-card)] border-2 border-coral/30 bg-white p-4"
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blush text-rust"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="rappel-notifications" className="font-bold text-night">
          {labels.title}
        </h2>
        <p className="mt-0.5 text-sm text-ink/80">{labels.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          <Link
            href={href}
            className="inline-flex min-h-11 items-center font-semibold text-coral-dark underline underline-offset-4"
          >
            {labels.action} →
          </Link>
          <button
            type="button"
            onClick={later}
            className="inline-flex min-h-11 items-center text-sm text-ink/70 underline"
          >
            {labels.later}
          </button>
        </div>
      </div>
    </aside>
  );
}
