"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import {
  requestLoginAction,
  verifyCodeAction,
} from "@/app/(tenant)/sites/[tenantId]/mes-rendez-vous/actions";

const inputClass =
  "block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 py-3 text-lg text-site-text";
const primaryClass =
  "inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50";

/**
 * Connexion à l'espace : e-mail (lien) ou téléphone (code SMS). Le message est
 * le même que l'adresse soit connue ou non.
 */
export function CustomerLogin() {
  const t = useTranslations("site.account");
  const tErrors = useTranslations("errors");
  const [sent, sendAction, sending] = useActionState(requestLoginAction, null);
  const [checked, verifyAction, verifying] = useActionState(verifyCodeAction, null);
  const [restart, setRestart] = useState(0);
  const done = sent?.ok && sent.data && restart === 0 ? sent.data : null;

  if (done) {
    return (
      <div className="space-y-5 rounded-site border border-site-border bg-site-card p-5 sm:p-6">
        <p role="status" className="text-lg">
          {done.channel === "email" ? t("sentEmail", { identifier: done.identifier }) : t("sentSms")}
        </p>
        {done.channel === "sms" && (
          <form action={verifyAction} className="space-y-3">
            <input type="hidden" name="phone" value={done.identifier} />
            <label htmlFor="code" className="block font-semibold">
              {t("codeLabel")}
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,8}"
              maxLength={8}
              required
              className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
            />
            {checked && !checked.ok && (
              <p role="alert" className="text-sm font-semibold text-red-700">
                {tErrors(checked.error)}
              </p>
            )}
            <button type="submit" disabled={verifying} className={primaryClass}>
              {t("verify")}
            </button>
          </form>
        )}
        <p className="text-sm text-site-muted">{t("checkSpam")}</p>
        <button
          type="button"
          onClick={() => setRestart((value) => value + 1)}
          className="font-semibold text-site-accent underline underline-offset-4"
        >
          {t("other")}
        </button>
      </div>
    );
  }

  return (
    <form
      action={(data) => {
        setRestart(0);
        return sendAction(data);
      }}
      className="space-y-4 rounded-site border border-site-border bg-site-card p-5 sm:p-6"
    >
      <div>
        <label htmlFor="identifier" className="mb-2 block font-semibold">
          {t("identifierLabel")}
        </label>
        <input
          id="identifier"
          name="identifier"
          autoComplete="email"
          required
          maxLength={254}
          aria-describedby="identifier-hint"
          className={inputClass}
        />
        <p id="identifier-hint" className="mt-1 text-sm text-site-muted">
          {t("identifierHint")}
        </p>
      </div>
      {sent && !sent.ok && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {tErrors(sent.error)}
        </p>
      )}
      <button type="submit" disabled={sending} className={primaryClass}>
        {t("send")}
      </button>
    </form>
  );
}
