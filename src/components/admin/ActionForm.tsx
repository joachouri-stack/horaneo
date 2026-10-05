"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/admin/mutation";

type Props = {
  action: (previous: ActionResult<unknown> | null, formData: FormData) => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  submitLabel?: string;
  /** Vide le formulaire après succès (ajout d'un élément). */
  resetOnSuccess?: boolean;
  className?: string;
  /** Bouton discret (actions secondaires). */
  variant?: "primary" | "secondary" | "link" | "danger";
  confirm?: string;
  encType?: "multipart/form-data";
};

/**
 * Formulaire relié à une action serveur : affiche « Enregistré » ou un message
 * d'erreur clair, et met en évidence le champ concerné.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess,
  className,
  variant = "primary",
  confirm,
}: Props) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
    const form = formRef.current;
    if (!form) return;
    form.querySelectorAll("[aria-invalid]").forEach((element) => element.removeAttribute("aria-invalid"));
    if (state && !state.ok) {
      for (const field of state.fields ?? (state.field ? [state.field] : [])) {
        form.querySelector(`[name="${CSS.escape(field)}"]`)?.setAttribute("aria-invalid", "true");
      }
    }
  }, [state, resetOnSuccess]);

  const buttonClass =
    variant === "primary"
      ? `${ui.primaryButton} sm:w-auto`
      : variant === "secondary"
        ? `${ui.secondaryButton} sm:w-auto`
        : variant === "danger"
          ? "font-semibold text-coral-dark underline disabled:opacity-60"
          : "font-semibold text-night underline disabled:opacity-60";

  return (
    <form
      ref={formRef}
      action={formAction}
      className={className ?? "space-y-4"}
      onSubmit={(event) => {
        // Envoi géré ici plutôt que par React : sinon le formulaire est vidé après
        // chaque envoi, et la personne perd sa saisie en cas d'erreur.
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {state && !state.ok && (
        <p role="alert" className={ui.error}>
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state?.ok && (
        <p role="status" className={ui.success}>
          {state.message ?? t("common.saved")}
        </p>
      )}
      {submitLabel && (
        <button type="submit" disabled={pending} className={buttonClass}>
          {submitLabel}
        </button>
      )}
    </form>
  );
}
