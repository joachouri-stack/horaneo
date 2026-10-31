"use client";

import { MAGIC_LINK_TTL_MINUTES } from "@/config/auth";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { ui } from "@/components/ui/styles";
import { verifyLoginCodeAction } from "@/app/(platform)/[locale]/connexion/actions";
import { authClient } from "@/lib/auth/client";
import type { SocialProviderId } from "@/lib/auth/providers";

type Props = {
  providers: SocialProviderId[];
  /** Page à ouvrir après connexion (chemin interne, déjà vérifié). */
  callbackPath: string;
  /** Page de connexion, pour afficher une erreur. */
  errorPath: string;
};

type State =
  | { step: "form"; error?: "invalidEmail" | "tooManyAttempts" | "generic" | "social" }
  | { step: "sent"; email: string; error?: "codeInvalid" | "codeLocked" | "generic" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ providers, callbackPath, errorPath }: Props) {
  const t = useTranslations("auth");
  const [state, setState] = useState<State>({ step: "form" });
  const [pending, setPending] = useState(false);

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
        <button
          type="button"
          onClick={() => setState({ step: "form" })}
          className="mt-6 font-semibold text-night underline"
        >
          {t("useAnotherEmail")}
        </button>
      </div>
    );
  }

  return (
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
                {t("continueWith", { provider: t(`providers.${provider}`) })}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-3 text-sm text-ink/60" aria-hidden="true">
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

      <p className="text-sm text-ink/60">{t("legal")}</p>
    </div>
  );
}
