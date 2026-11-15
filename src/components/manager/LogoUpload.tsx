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
  // Nom du fichier choisi, affiché à côté du bouton (le champ natif est masqué).
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
      <div className="flex h-28 w-full flex-none items-center justify-center rounded-xl border border-navy/10 bg-white p-3 sm:w-48">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={t("current")} className="max-h-24 max-w-full object-contain" />
        ) : (
          <span className="text-sm text-ink/70">{t("none")}</span>
        )}
      </div>
      <form action={formAction} className="flex-1 space-y-2">
        <input type="hidden" name="tenantId" value={tenantId} />
        {/* Même bouton que pour les photos ; le champ natif (en anglais selon le navigateur) est masqué. */}
        <label
          className={`${ui.secondaryButton} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/40 sm:w-auto`}
        >
          <input
            id="logo-file"
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            required
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              const big = Boolean(file && file.size > MAX_UPLOAD_BYTES);
              setTooLarge(big);
              setFileName(big ? null : (file?.name ?? null));
              if (big) event.currentTarget.value = "";
            }}
          />
          🖼️ {t("choose")}
        </label>
        {fileName && <p className="text-sm font-medium text-night">{t("chosen", { name: fileName })}</p>}
        <p className="text-sm text-ink/70">{t("hint")}</p>
        <button type="submit" disabled={pending || !fileName} className={`${ui.primaryButton} sm:w-auto`}>
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
