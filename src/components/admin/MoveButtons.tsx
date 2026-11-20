"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import type { ActionResult } from "@/lib/admin/mutation";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;

/**
 * Flèches « monter » / « descendre » d'un élément d'une liste : deux petits boutons
 * à côté de la ligne, plutôt que des liens texte. Un message s'affiche seulement en cas d'erreur.
 */
export function MoveButtons({
  action,
  values,
  canUp,
  canDown,
  labels,
}: {
  action: Action;
  values: Record<string, string | undefined>;
  canUp: boolean;
  canDown: boolean;
  labels: { up: string; down: string };
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState(action, null);
  const button = (direction: "up" | "down", enabled: boolean) => (
    <button
      type="submit"
      name="direction"
      value={direction}
      disabled={!enabled || pending}
      aria-label={direction === "up" ? labels.up : labels.down}
      title={direction === "up" ? labels.up : labels.down}
      className="flex size-10 items-center justify-center rounded-lg text-ink/70 transition hover:bg-navy/5 hover:text-night disabled:invisible"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={direction === "up" ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"} />
      </svg>
    </button>
  );
  return (
    <form action={formAction} className="flex shrink-0 flex-col">
      {Object.entries(values).map(([key, value]) =>
        value === undefined ? null : <input key={key} type="hidden" name={key} value={value} />,
      )}
      {button("up", canUp)}
      {button("down", canDown)}
      {state && !state.ok && (
        <p role="alert" className="max-w-24 text-xs text-danger-ink">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
