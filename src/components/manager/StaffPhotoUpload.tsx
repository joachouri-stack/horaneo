"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState } from "react";
import type { ActionResult } from "@/lib/actions/result";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;

/** Photo d'un membre : choisir une image l'envoie aussitôt ; « Retirer » revient aux initiales. */
export function StaffPhotoUpload({
  tenantId,
  staffId,
  hasPhoto,
  action,
}: {
  tenantId: string;
  staffId: string;
  hasPhoto: boolean;
  action: Action;
}) {
  const t = useTranslations("manager.team");
  const tErrors = useTranslations("errors");
  const [state, send, pending] = useActionState(action, null);
  const submit = (file: File | null) => {
    const data = new FormData();
    data.set("tenantId", tenantId);
    data.set("id", staffId);
    if (file) data.set("file", file);
    else data.set("operation", "remove");
    startTransition(() => send(data));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border border-hairline bg-white px-4 text-sm font-medium text-night transition hover:border-accent-line ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        {pending ? t("photoSending") : hasPhoto ? t("changePhoto") : t("addPhoto")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) submit(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {hasPhoto && (
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(null)}
          className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-ink-soft hover:text-[#b4372a] disabled:opacity-60"
        >
          {t("removePhoto")}
        </button>
      )}
      {state && !state.ok && (
        <p role="alert" className="w-full text-sm text-[#b4372a]">
          {tErrors(state.error)}
        </p>
      )}
    </div>
  );
}
