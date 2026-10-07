"use client";

import { useEffect, useState } from "react";
import {
  disablePushAction,
  enablePushAction,
  testPushAction,
} from "@/app/(platform)/[locale]/espace/[tenantId]/actions";
import { ui } from "@/components/ui/styles";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

type Labels = Record<
  | "title"
  | "intro"
  | "enable"
  | "disable"
  | "test"
  | "testSent"
  | "on"
  | "off"
  | "denied"
  | "unsupported"
  | "iosTitle"
  | "iosStep1"
  | "iosStep2"
  | "iosStep3"
  | "working"
  | "error",
  string
>;

/** Clé publique du serveur (base64url) au format attendu par le navigateur. */
function keyBytes(base64url: string) {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function isIos() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Une étape du navigateur qui ne répond pas (réseau coupé…) ne bloque pas le bouton. */
function withTimeout<T>(promise: Promise<T>, ms = 20_000) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return { registration, subscription: await registration.pushManager.getSubscription() };
}

/**
 * Notifications sur l'appareil de la gérante (Web Push) : activer, couper,
 * envoyer un essai. Sur iPhone, l'espace doit d'abord être ajouté à l'écran d'accueil.
 */
export function PushSettings({
  tenantId,
  publicKey,
  labels,
}: {
  tenantId: string;
  publicKey: string;
  labels: Labels;
}) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const decide = async (): Promise<State> => {
      if (!supported) return isIos() && !isInstalled() ? "install" : "unsupported";
      if (Notification.permission === "denied") return "denied";
      const { subscription } = await currentSubscription();
      if (!subscription) return "off";
      // Déjà abonné : on le rappelle au serveur (appareil passé à une autre gérante, base restaurée…).
      const json = subscription.toJSON();
      await enablePushAction(tenantId, { endpoint: json.endpoint ?? "", keys: json.keys as never });
      return "on";
    };
    decide()
      .catch(() => "off" as const)
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const enable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const { registration, subscription: existing } = await withTimeout(currentSubscription());
      const subscription =
        existing ??
        (await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(publicKey),
          }),
        ));
      const json = subscription.toJSON();
      const result = await enablePushAction(tenantId, {
        endpoint: json.endpoint ?? "",
        keys: json.keys as never,
      });
      if (!result.ok) throw new Error(result.error);
      setState("on");
    } catch {
      setMessage(labels.error);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { subscription } = await currentSubscription();
      if (subscription) {
        await disablePushAction(tenantId, subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setMessage(labels.error);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    const result = await testPushAction(tenantId);
    setMessage(result.ok ? labels.testSent : labels.error);
    setBusy(false);
  };

  if (state === "loading") return null;

  return (
    <section
      aria-labelledby="notifications-telephone"
      className="rounded-[var(--radius-card)] border-2 border-line bg-white p-4 sm:p-5"
    >
      <h2 id="notifications-telephone" className="font-bold text-night">
        {labels.title}
      </h2>
      <p className="mt-1 text-sm text-ink/80">{labels.intro}</p>

      {state === "install" && (
        <div className="mt-3 rounded-[var(--radius-card)] bg-blush/60 p-3 text-sm text-ink">
          <p className="font-semibold">{labels.iosTitle}</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>{labels.iosStep1}</li>
            <li>{labels.iosStep2}</li>
            <li>{labels.iosStep3}</li>
          </ol>
        </div>
      )}
      {state === "unsupported" && <p className="mt-3 text-sm text-ink">{labels.unsupported}</p>}
      {state === "denied" && <p className="mt-3 text-sm text-ink">{labels.denied}</p>}

      {state === "off" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-ink/70">{labels.off}</p>
          <button type="button" onClick={enable} disabled={busy} className={`${ui.primaryButton} sm:w-auto`}>
            {busy ? labels.working : labels.enable}
          </button>
        </div>
      )}

      {state === "on" && (
        <div className="mt-3 space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
            {labels.on}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={test}
              disabled={busy}
              className={`${ui.secondaryButton} sm:w-auto`}
            >
              {labels.test}
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="inline-flex min-h-12 items-center px-3 font-semibold text-night underline"
            >
              {labels.disable}
            </button>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-ink">
          {message}
        </p>
      )}
    </section>
  );
}
