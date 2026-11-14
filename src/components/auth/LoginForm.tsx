"use client";

import { MAGIC_LINK_TTL_MINUTES } from "@/config/auth";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { verifyLoginCodeAction } from "@/app/(platform)/[locale]/connexion/actions";
import { authClient } from "@/lib/auth/client";
import type { SocialProviderId } from "@/lib/auth/providers";

type Props = {
  providers: SocialProviderId[];
  /** Page à ouvrir après connexion (chemin interne, déjà vérifié). */
  callbackPath: string;
  /** Page de connexion, pour afficher une erreur. */
  errorPath: string;
  /** Présentation (pack choisi, explication), masquée une fois l'e-mail envoyé. */
  intro?: ReactNode;
};

/** Attente avant de pouvoir renvoyer l'e-mail de connexion (secondes). */
const RESEND_DELAY_SECONDS = 30;

/** Logos officiels des connexions proposées (exigés par Google et Apple sur leurs boutons). */
const PROVIDER_ICONS: Record<SocialProviderId, ReactNode> = {
  google: (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  ),
  apple: (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M16.37 12.6c-.02-2.27 1.86-3.36 1.94-3.41-1.06-1.55-2.7-1.76-3.28-1.78-1.4-.14-2.73.82-3.44.82-.71 0-1.8-.8-2.96-.78-1.52.02-2.93.89-3.71 2.25-1.58 2.75-.4 6.81 1.14 9.04.75 1.09 1.65 2.31 2.82 2.27 1.13-.05 1.56-.73 2.93-.73 1.37 0 1.75.73 2.95.71 1.22-.02 1.99-1.11 2.73-2.2.86-1.26 1.21-2.48 1.23-2.55-.03-.01-2.36-.9-2.38-3.59zM14.12 5.93c.62-.76 1.04-1.81.93-2.86-.9.04-1.99.6-2.64 1.36-.58.67-1.09 1.74-.95 2.77 1 .08 2.03-.51 2.66-1.27z" />
    </svg>
  ),
};

type State =
  | { step: "form"; error?: "invalidEmail" | "tooManyAttempts" | "generic" | "social" }
  | { step: "sent"; email: string; error?: "codeInvalid" | "codeLocked" | "generic" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ providers, callbackPath, errorPath, intro }: Props) {
  const t = useTranslations("auth");
  const [state, setState] = useState<State>({ step: "form" });
  const [pending, setPending] = useState(false);
  // Renvoi de l'e-mail : possible après une courte attente.
  const [wait, setWait] = useState(0);
  const [resent, setResent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Ordinateur (souris) : le champ e-mail est prêt à la saisie. Pas sur téléphone (clavier ouvert d'office).
  useEffect(() => {
    if (state.step === "form" && window.matchMedia("(pointer: fine)").matches) emailRef.current?.focus();
  }, [state.step]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  function errorFromStatus(status?: number) {
    return status === 429 ? "tooManyAttempts" : "generic";
  }

  async function signInWithProvider(provider: SocialProviderId) {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: callbackPath,
      errorCallbackURL: `${errorPath}?erreur=social`,
    });
    if (error) {
      setPending(false);
      setState({ step: "form", error: errorFromStatus(error.status) });
    }
  }

  async function sendMagicLink(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    if (!EMAIL.test(email)) {
      setState({ step: "form", error: "invalidEmail" });
      return;
    }
    setPending(true);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: callbackPath,
      newUserCallbackURL: callbackPath,
      errorCallbackURL: `${errorPath}?erreur=lien`,
    });
    setPending(false);
    setState(error ? { step: "form", error: errorFromStatus(error.status) } : { step: "sent", email });
    if (!error) {
      setWait(RESEND_DELAY_SECONDS);
      setResent(false);
    }
  }

  /** Renvoie l'e-mail de connexion à la même adresse. */
  async function resend() {
    if (state.step !== "sent" || wait > 0) return;
    setPending(true);
    const { error } = await authClient.signIn.magicLink({
      email: state.email,
      callbackURL: callbackPath,
      newUserCallbackURL: callbackPath,
      errorCallbackURL: `${errorPath}?erreur=lien`,
    });
    setPending(false);
    setWait(RESEND_DELAY_SECONDS);
    setResent(!error);
    if (error) setState({ step: "sent", email: state.email, error: "generic" });
  }

  // onSubmit (et non action) : le champ garde le code saisi en cas d'erreur.
  async function signInWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.step !== "sent") return;
    const formData = new FormData(event.currentTarget);
    const { email } = state;
    setPending(true);
    try {
      const outcome = await verifyLoginCodeAction(
        email,
        String(formData.get("code") ?? ""),
        callbackPath,
        errorPath,
      );
      if ("url" in outcome) {
        // Le navigateur ouvre le lien de connexion : session créée, puis l'espace.
        window.location.assign(outcome.url);
        return;
      }
      setState({ step: "sent", email, error: outcome.error });
    } catch {
      setState({ step: "sent", email, error: "generic" });
    }
    setPending(false);
  }

  if (state.step === "sent") {
    return (
      <div className="mt-8">
        <div role="status">
          <h2 className="text-xl font-bold">{t("sentTitle")}</h2>
          <p className="mt-3">{t("sentBody", { email: state.email, minutes: MAGIC_LINK_TTL_MINUTES })}</p>
        </div>
        <form onSubmit={signInWithCode} noValidate className="mt-6 space-y-3 rounded-2xl bg-navy/5 p-4">
          <label htmlFor="code" className={ui.label}>
            {t("codeLabel")}
          </label>
          <p className="text-sm text-ink/70">{t("codeHint")}</p>
          {state.error && (
            <p role="alert" className={ui.error}>
              {t(`errors.${state.error}`)}
            </p>
          )}
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            placeholder="123456"
            className={`${ui.input} text-center font-mono text-2xl tracking-[0.4em]`}
          />
          <button type="submit" disabled={pending} className={ui.primaryButton}>
            {pending ? t("checking") : t("codeSubmit")}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink/70">{t("sentHint")}</p>
        {resent && (
          <p role="status" className="mt-2 text-sm font-semibold text-success">
            {t("resent")}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <button
            type="button"
            onClick={resend}
            disabled={pending || wait > 0}
            className="inline-flex min-h-11 items-center font-semibold text-night underline disabled:text-ink/60 disabled:no-underline"
          >
            {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
          </button>
          <button
            type="button"
            onClick={() => setState({ step: "form" })}
            className="inline-flex min-h-11 items-center font-semibold text-night underline"
          >
            {t("useAnotherEmail")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {intro}
      <div className="mt-8 space-y-6">
        {state.error && (
          <p role="alert" className={ui.error}>
            {t(`errors.${state.error}`)}
          </p>
        )}

        {providers.length > 0 && (
          <>
            <div className="space-y-3">
              {providers.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  disabled={pending}
                  onClick={() => signInWithProvider(provider)}
                  className={ui.secondaryButton}
                >
                  {PROVIDER_ICONS[provider]}
                  {t("continueWith", { provider: t(`providers.${provider}`) })}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-3 text-sm text-ink/70" aria-hidden="true">
              <span className="h-px flex-1 bg-navy/15" />
              {t("or")}
              <span className="h-px flex-1 bg-navy/15" />
            </p>
          </>
        )}

        <form action={sendMagicLink} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className={ui.label}>
              {t("emailLabel")}
            </label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder={t("emailPlaceholder")}
              className={ui.input}
            />
          </div>
          <button type="submit" disabled={pending} className={ui.primaryButton}>
            {pending ? t("sending") : t("sendLink")}
          </button>
        </form>

        <p className="text-sm text-ink/70">
          {t.rich("legal", {
            terms: (chunks) => (
              <Link href="/conditions" className="underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/confidentialite" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <p className="border-t border-navy/10 pt-5 text-sm text-ink/80">
          {t("noSite")}{" "}
          <Link href={{ pathname: "/", hash: "tarifs" }} className="font-semibold text-night underline">
            {t("discoverPlans")}
          </Link>
        </p>
      </div>
    </>
  );
}
