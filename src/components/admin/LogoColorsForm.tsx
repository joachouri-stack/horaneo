"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { updateAppearanceAction, uploadLogoAction } from "@/app/(platform)/[locale]/admin/clients/actions";
import { ui } from "@/components/ui/styles";
import { contrastRatio, readableTextOn } from "@/lib/colors";
import type { LogoPalette } from "@/lib/images/palette";
import type { ActionResult } from "@/lib/admin/mutation";
import { ActionForm } from "./ActionForm";
import { Hidden } from "./fields";

type Props = {
  tenantId: string;
  logoUrl: string | null;
  primary: string;
  secondary: string;
  appearance: { businessCategory: string; templateKey: string; theme: string };
};

/**
 * Logo et couleurs : à l'envoi du logo, ses couleurs sont proposées ; on les
 * ajuste avec un aperçu, puis on enregistre.
 */
export function LogoColorsForm({
  tenantId,
  logoUrl,
  primary: initialPrimary,
  secondary: initialSecondary,
  appearance,
}: Props) {
  const t = useTranslations("admin.tenant.logo");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);
  const [suggested, setSuggested] = useState(false);

  const [uploadState, uploadAction, uploading] = useActionState(
    async (previous: ActionResult<LogoPalette> | null, data: FormData) => {
      const result = await uploadLogoAction(previous, data);
      if (result.ok && result.data) {
        setPrimary(result.data.primary);
        setSecondary(result.data.secondary);
        setSuggested(true);
      }
      return result;
    },
    null,
  );

  const textOnPrimary = readableTextOn(primary);
  const lowContrast = contrastRatio(primary, textOnPrimary) < 3;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex h-28 w-48 items-center justify-center rounded-lg border border-navy/10 bg-white p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={t("current")} className="max-h-24 max-w-44 object-contain" />
          ) : (
            <span className="text-sm text-ink/60">{t("none")}</span>
          )}
        </div>
        <form action={uploadAction} className="flex-1 space-y-2">
          <Hidden values={{ tenantId }} />
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
          />
          <p className="text-sm text-ink/60">{t("uploadHint")}</p>
          <button type="submit" disabled={uploading} className={`${ui.secondaryButton} sm:w-auto`}>
            {t("upload")}
          </button>
          {uploadState && !uploadState.ok && (
            <p role="alert" className={ui.error}>
              {tErrors(uploadState.error)}
            </p>
          )}
        </form>
      </div>

      {suggested && <p className={ui.success}>{t("suggested")}</p>}

      <ActionForm action={updateAppearanceAction} submitLabel={tCommon("save")}>
        <Hidden values={{ tenantId, ...appearance }} />
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { name: "primary", label: t("primary"), value: primary, set: setPrimary },
            { name: "secondary", label: t("secondary"), value: secondary, set: setSecondary },
          ].map((color) => (
            <div key={color.name}>
              <label htmlFor={`c-${color.name}`} className={ui.label}>
                {color.label}
              </label>
              <div className="flex items-center gap-3">
                <input
                  id={`c-${color.name}`}
                  type="color"
                  value={color.value}
                  onChange={(event) => color.set(event.target.value)}
                  className="h-12 w-16 cursor-pointer rounded border border-navy/15"
                />
                <input
                  name={color.name}
                  value={color.value}
                  onChange={(event) => color.set(event.target.value)}
                  pattern="#[0-9a-fA-F]{6}"
                  aria-label={color.label}
                  className={`${ui.input} font-mono`}
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className={ui.label}>{t("preview")}</p>
          <div className="rounded-lg p-6" style={{ background: secondary }}>
            <span
              className="inline-block rounded-lg px-6 py-3 font-bold"
              style={{ background: primary, color: textOnPrimary }}
            >
              {t("previewButton")}
            </span>
          </div>
          {lowContrast && <p className={`mt-2 ${ui.error}`}>{t("contrastWarning")}</p>}
        </div>
      </ActionForm>
    </div>
  );
}
