"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { updateAppearanceAction, uploadLogoAction } from "@/app/(platform)/[locale]/admin/clients/actions";
import { LogoUpload } from "@/components/manager/LogoUpload";
import { ui } from "@/components/ui/styles";
import { contrastRatio, readableTextOn } from "@/lib/colors";
import type { LogoPalette } from "@/lib/images/palette";
import type { ActionResult } from "@/lib/admin/mutation";
import { ActionForm } from "./ActionForm";
import { Hidden } from "./fields";

type Appearance = { businessCategory: string; templateKey: string; theme: string };

/**
 * Logo dans l'éditeur du site (admin) : envoyé dès qu'il est choisi, comme pour la gérante ; ses
 * couleurs sont ensuite proposées, à appliquer d'un clic.
 */
export function AdminLogoField({
  tenantId,
  logoUrl,
  appearance,
}: {
  tenantId: string;
  logoUrl: string | null;
  appearance: Appearance;
}) {
  const t = useTranslations("admin.tenant.logo");
  const [suggested, setSuggested] = useState<LogoPalette | null>(null);
  const action = async (previous: ActionResult<unknown> | null, data: FormData) => {
    const result = await uploadLogoAction(previous as ActionResult<LogoPalette> | null, data);
    if (result.ok && result.data) setSuggested(result.data);
    return result;
  };
  return (
    <div className="space-y-4">
      <LogoUpload tenantId={tenantId} logoUrl={logoUrl} action={action} />
      {suggested && (
        <div className="rounded-xl bg-mist-50 p-3">
          <p className="mb-3 text-sm font-medium text-night">{t("suggestedTitle")}</p>
          <ActionForm action={updateAppearanceAction} submitLabel={t("suggestApply")} variant="secondary">
            <Hidden
              values={{ tenantId, ...appearance, primary: suggested.primary, secondary: suggested.secondary }}
            />
            <span aria-hidden="true" className="flex gap-2">
              <span
                className="size-8 rounded-full border border-black/10"
                style={{ background: suggested.primary }}
              />
              <span
                className="size-8 rounded-full border border-black/10"
                style={{ background: suggested.secondary }}
              />
            </span>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

/** Couleurs au code près (admin), repliées sous les palettes, avec l'aperçu du bouton. */
export function AdminCustomColors({
  tenantId,
  primary: initialPrimary,
  secondary: initialSecondary,
  appearance,
}: {
  tenantId: string;
  primary: string;
  secondary: string;
  appearance: Appearance;
}) {
  const t = useTranslations("admin.tenant.logo");
  const tCommon = useTranslations("common");
  const [primary, setPrimary] = useState(initialPrimary);
  const [secondary, setSecondary] = useState(initialSecondary);
  const textOnPrimary = readableTextOn(primary);
  const lowContrast = contrastRatio(primary, textOnPrimary) < 3;
  return (
    <details className="mt-4 rounded-xl border border-hairline p-3">
      <summary className="min-h-11 cursor-pointer content-center font-medium text-night">
        {t("custom")}
      </summary>
      <div className="mt-3">
        <ActionForm action={updateAppearanceAction} submitLabel={tCommon("save")}>
          <Hidden values={{ tenantId, ...appearance }} />
          <div className="grid gap-4">
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
                    className="h-11 w-14 flex-none cursor-pointer rounded border border-navy/15"
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
            <div className="rounded-lg p-4" style={{ background: secondary }}>
              <span
                className="inline-block rounded-lg px-5 py-2.5 font-bold"
                style={{ background: primary, color: textOnPrimary }}
              >
                {t("previewButton")}
              </span>
            </div>
            {lowContrast && <p className={`mt-2 ${ui.error}`}>{t("contrastWarning")}</p>}
          </div>
        </ActionForm>
      </div>
    </details>
  );
}
