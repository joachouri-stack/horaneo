"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { createTenantAction } from "@/app/(platform)/[locale]/admin/clients/actions";
import { ui } from "@/components/ui/styles";
import { slugify } from "@/modules/tenants/slug";
import { ActionForm } from "./ActionForm";
import { SelectField, TextField } from "./fields";

type Props = { plans: { value: string; label: string }[]; mainDomain: string };

/** Première étape : coordonnées ; l'adresse du site est proposée à partir du nom. */
export function CreateTenantForm({ plans, mainDomain }: Props) {
  const t = useTranslations("admin.create");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <ActionForm action={createTenantAction} submitLabel={t("submit")}>
      <div>
        <label htmlFor="f-name" className={ui.label}>
          {t("name")}
        </label>
        <input
          id="f-name"
          name="name"
          required
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
          {t("slugHint", { example: `${slug || "nom"}.${mainDomain}` })}
        </p>
      </div>
      <SelectField name="planCode" label={t("plan")} options={plans} defaultValue="basic" />
      <TextField
        name="managerEmail"
        type="email"
        inputMode="email"
        label={t("managerEmail")}
        hint={t("managerEmailHint")}
        required
      />
      <TextField name="managerName" label={t("managerName")} />
      <TextField name="phone" type="tel" inputMode="tel" label={t("phone")} />
      <TextField name="email" type="email" inputMode="email" label={t("email")} />
    </ActionForm>
  );
}
