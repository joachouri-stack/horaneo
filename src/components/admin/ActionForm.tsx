"use client";

import { useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/admin/mutation";
import { FieldErrorsContext } from "./fields";

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
  /** Message affiché après succès quand l'action n'en renvoie pas (à la place de « Enregistré »). */
  successMessage?: string;
  /** Bouton collé en bas de l'écran (longs formulaires). */
  stickySubmit?: boolean;
};

/** Champs en erreur du résultat (un seul ou plusieurs). */
function invalidFields(state: ActionResult<unknown> | null): string[] {
  if (!state || state.ok) return [];
  return state.fields ?? (state.field ? [state.field] : []);
}

/** Nom lisible d'un champ : son libellé (ou celui de la case à cocher qui l'entoure). */
function fieldLabel(element: Element): string {
  const labelled = (element as HTMLInputElement).labels?.[0] ?? element.closest("label");
  return labelled?.textContent?.trim() ?? "";
}

/**
 * Formulaire relié à une action serveur : affiche « Enregistré » ou un message
 * d'erreur clair. En cas d'erreur, le message nomme les champs concernés, chaque
 * champ affiche sa propre erreur, et le premier est déplié, montré et sélectionné.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  resetOnSuccess,
  className,
  variant = "primary",
  confirm,
  successMessage,
  stickySubmit,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [labels, setLabels] = useState<string[]>([]);

  const fields = useMemo(() => invalidFields(state), [state]);
  const errorText = state && !state.ok ? t(`errors.${state.error}`) : "";
  // Erreur de validation : chaque champ dit « vide ou hors limites » ; erreur métier : son message.
  const fieldErrors = useMemo(
    () =>
      Object.fromEntries(
        fields.map((field) => [
          field,
          state && !state.ok && state.error === "invalid" ? t("errors.fieldInvalid") : errorText,
        ]),
      ),
    [fields, state, errorText, t],
  );

  useEffect(() => {
    if (state?.ok && resetOnSuccess) formRef.current?.reset();
    const form = formRef.current;
    if (!form) return;
    // Champs qui ne sont pas des champs de fields.tsx (saisies sur mesure) : marqués ici.
    form.querySelectorAll("[data-invalid]").forEach((element) => {
      element.removeAttribute("aria-invalid");
      element.removeAttribute("data-invalid");
    });
    const elements = fields
      .map((field) => form.querySelector(`[name="${CSS.escape(field)}"]`))
      .filter((element): element is HTMLElement => element instanceof HTMLElement);
    for (const element of elements) {
      if (!element.hasAttribute("aria-invalid")) {
        element.setAttribute("aria-invalid", "true");
        element.setAttribute("data-invalid", "");
      }
    }
    // Libellés lus après le rendu : ils nomment les champs dans le message d'erreur.
    setLabels([...new Set(elements.map(fieldLabel).filter(Boolean))]);
    const first = elements.find((element) => (element as HTMLInputElement).type !== "hidden");
    if (!first) return;
    // Le champ peut être dans une section repliée : on ouvre chaque section qui l'entoure.
    for (
      let details = first.closest("details");
      details;
      details = details.parentElement?.closest("details") ?? null
    ) {
      details.open = true;
    }
    first.scrollIntoView({ block: "center" });
    first.focus({ preventScroll: true });
  }, [state, resetOnSuccess, fields]);

  const buttonClass =
    variant === "primary"
      ? `${ui.primaryButton} sm:w-auto`
      : variant === "secondary"
        ? `${ui.secondaryButton} sm:w-auto`
        : variant === "danger"
          ? "inline-flex min-h-11 items-center font-semibold text-coral-dark underline disabled:opacity-60"
          : "inline-flex min-h-11 items-center font-semibold text-night underline disabled:opacity-60";

  const list = new Intl.ListFormat(locale, { type: "conjunction" });
  const alertText =
    state && !state.ok && labels.length > 0
      ? state.error === "invalid"
        ? t("errors.invalidFields", {
            count: labels.length,
            fields: list.format(labels.map((label) => t("common.quoted", { text: label }))),
          })
        : `${errorText} ${t("errors.fieldsConcerned", {
            count: labels.length,
            fields: list.format(labels.map((label) => t("common.quoted", { text: label }))),
          })}`
      : errorText;

  const feedback = (
    <>
      {state && !state.ok && (
        <p role="alert" className={ui.error}>
          {alertText}
        </p>
      )}
      {state?.ok && (
        <p role="status" className={ui.success}>
          {state.message ?? successMessage ?? t("common.saved")}
        </p>
      )}
    </>
  );

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
      <FieldErrorsContext.Provider value={fieldErrors}>{children}</FieldErrorsContext.Provider>
      {stickySubmit ? (
        // Bouton et message toujours visibles en bas de l'écran pendant qu'on fait défiler le formulaire.
        <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t border-hairline bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          {feedback}
          {submitLabel && (
            <button type="submit" disabled={pending} className={buttonClass}>
              {submitLabel}
            </button>
          )}
        </div>
      ) : (
        <>
          {feedback}
          {submitLabel && (
            <button type="submit" disabled={pending} className={buttonClass}>
              {submitLabel}
            </button>
          )}
        </>
      )}
    </form>
  );
}
