"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createTenantAction } from "@/app/(platform)/[locale]/admin/clients/actions";
import { ui } from "@/components/ui/styles";
import { slugify } from "@/modules/tenants/slug";
import { ActionForm } from "./ActionForm";
import { SelectField, TextField } from "./fields";

type Prefill = {
  orderId: string;
  name: string;
  planCode: string;
  managerEmail: string;
  managerName: string | null;
  phone: string;
};
type Props = { plans: { value: string; label: string }[]; mainDomain: string; prefill?: Prefill | null };

/** Première étape : coordonnées ; l'adresse du site est proposée à partir du nom. */
export function CreateTenantForm({ plans, mainDomain, prefill }: Props) {
  const t = useTranslations("admin.create");
  const [slug, setSlug] = useState(prefill ? slugify(prefill.name) : "");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <ActionForm action={createTenantAction} submitLabel={t("submit")}>
      {prefill && <input type="hidden" name="orderId" value={prefill.orderId} />}
      <div>
        <label htmlFor="f-name" className={ui.label}>
          {t("name")}
        </label>
        <input
          id="f-name"
          name="name"
          required
          defaultValue={prefill?.name}
          className={ui.input}
          onChange={(event) => {
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
        />
      </div>
      <div>
        <label htmlFor="f-slug" className={ui.label}>
          {t("slug")}
        </label>
        <input
          id="f-slug"
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value.toLowerCase());
          }}
          className={ui.input}
        />
        <p className="mt-1 text-sm text-ink/60">
          {t("slugHint", { example: `${slug || t("slugPlaceholder")}.${mainDomain}` })}
        </p>
      </div>
      <SelectField
        name="planCode"
        label={t("plan")}
        options={plans}
        defaultValue={prefill?.planCode ?? "starter"}
      />
      <TextField
        name="managerEmail"
        type="email"
        inputMode="email"
        label={t("managerEmail")}
        hint={t("managerEmailHint")}
        defaultValue={prefill?.managerEmail}
        required
      />
      <TextField name="managerName" label={t("managerName")} defaultValue={prefill?.managerName} />
      <TextField name="phone" type="tel" inputMode="tel" label={t("phone")} defaultValue={prefill?.phone} />
      <TextField name="email" type="email" inputMode="email" label={t("email")} />
    </ActionForm>
  );
}
