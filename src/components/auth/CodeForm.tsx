"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { CodeFormState } from "@/app/(platform)/[locale]/admin/actions";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";

type Props = {
  action: (state: CodeFormState, formData: FormData) => Promise<CodeFormState>;
  label: string;
  submitLabel: string;
  /** Autorise les codes de secours (lettres et tiret) en plus des 6 chiffres. */
  allowBackupCode?: boolean;
};

/** Saisie d'un code de double vérification ; affiche les codes de secours à l'activation. */
export function CodeForm({ action, label, submitLabel, allowBackupCode = false }: Props) {
  const t = useTranslations("admin");
  const [state, formAction, pending] = useActionState(action, {});

  if (state.backupCodes) {
    return (
      <div className="mt-6 space-y-4">
        <h2 className="text-xl font-bold">{t("security.backupTitle")}</h2>
        <p>{t("security.backupIntro")}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-[var(--radius-card)] bg-ivory p-4 font-mono text-lg">
          {state.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Link href="/admin" className={ui.primaryButton}>
          {t("security.continue")}
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error && (
        <p role="alert" className={ui.error}>
          {t(`errors.${state.error}`)}
        </p>
      )}
      <div>
        <label htmlFor="code" className={ui.label}>
          {label}
        </label>
        <input
          id="code"
          name="code"
          required
          autoComplete="one-time-code"
          inputMode={allowBackupCode ? "text" : "numeric"}
          pattern={allowBackupCode ? undefined : "[0-9 ]{6,7}"}
          maxLength={allowBackupCode ? 11 : 7}
          className={`${ui.input} text-center font-mono text-2xl tracking-widest`}
        />
      </div>
      <button type="submit" disabled={pending} className={ui.primaryButton}>
        {submitLabel}
      </button>
    </form>
  );
}
