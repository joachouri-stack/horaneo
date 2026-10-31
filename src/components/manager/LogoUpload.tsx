"use client";

import { MAX_UPLOAD_BYTES } from "@/config/uploads";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/actions/result";

type Props = {
  tenantId: string;
  logoUrl: string | null;
  action: (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
};

/** Logo du site : aperçu du logo actuel et envoi d'un nouveau, en entier (sans recadrage). */
export function LogoUpload({ tenantId, logoUrl, action }: Props) {
  const t = useTranslations("manager.site.logo");
  const tErrors = useTranslations("errors");
  const [state, formAction, pending] = useActionState(action, null);
  // Trop lourd : refusé avant l'envoi (sinon l'envoi échoue sans message clair).
  const [tooLarge, setTooLarge] = useState(false);
  return (
    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex h-28 w-full flex-none items-center justify-center rounded-xl border border-navy/10 bg-white p-3 sm:w-48">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={t("current")} className="max-h-24 max-w-full object-contain" />
        ) : (
          <span className="text-sm text-ink/60">{t("none")}</span>
        )}
      </div>
      <form action={formAction} className="flex-1 space-y-2">
        <input type="hidden" name="tenantId" value={tenantId} />
        <label htmlFor="logo-file" className={ui.label}>
          {t("file")}
        </label>
        <input
          id="logo-file"
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          required
          className={ui.fileInput}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            const big = Boolean(file && file.size > MAX_UPLOAD_BYTES);
            setTooLarge(big);
            if (big) event.currentTarget.value = "";
          }}
        />
        <p className="text-sm text-ink/60">{t("hint")}</p>
        <button type="submit" disabled={pending} className={`${ui.primaryButton} sm:w-auto`}>
          {pending ? t("sending") : t("send")}
        </button>
        {tooLarge && (
          <p role="alert" className={ui.error}>
            {tErrors("image_too_large")}
          </p>
        )}
        {!tooLarge && state && !state.ok && (
          <p role="alert" className={ui.error}>
            {tErrors(state.error)}
          </p>
        )}
        {state?.ok && (
          <p role="status" className={ui.success}>
            {t("done")}
          </p>
        )}
      </form>
    </div>
  );
}
