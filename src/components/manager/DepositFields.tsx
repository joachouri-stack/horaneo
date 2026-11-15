"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CheckboxField, SelectField, TextField } from "@/components/admin/fields";

type DepositType = "percent" | "fixed";

/**
 * Acompte des réglages : le type et la valeur ne s'affichent que si l'acompte est
 * demandé (ils restent dans le formulaire, cachés, pour être enregistrés tels quels),
 * et le libellé de la valeur suit le type choisi.
 */
export function DepositFields({
  enabled,
  type,
  value,
  currency,
  children,
}: {
  enabled: boolean;
  type: DepositType;
  value: string;
  currency: string;
  /** Messages sur le compte de paiement et la règle de remboursement. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("manager.settings");
  const [on, setOn] = useState(enabled);
  const [kind, setKind] = useState<DepositType>(type);
  return (
    <div
      className="space-y-4"
      onChange={(event) => {
        const target = event.target as HTMLInputElement | HTMLSelectElement;
        if (target.name === "depositEnabled") setOn((target as HTMLInputElement).checked);
        if (target.name === "depositType") setKind(target.value as DepositType);
      }}
    >
      <CheckboxField name="depositEnabled" label={t("depositEnabled")} defaultChecked={enabled} />
      <div className="space-y-4" hidden={!on}>
        {children}
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="depositType"
            label={t("depositType")}
            defaultValue={type}
            options={[
              { value: "percent", label: t("percent") },
              { value: "fixed", label: t("fixed") },
            ]}
          />
          <TextField
            name="depositValue"
            inputMode="decimal"
            label={kind === "percent" ? t("depositPercentLabel") : t("depositAmountLabel", { currency })}
            hint={kind === "percent" ? t("depositPercentHint") : t("depositAmountHint")}
            defaultValue={value}
          />
        </div>
      </div>
    </div>
  );
}
