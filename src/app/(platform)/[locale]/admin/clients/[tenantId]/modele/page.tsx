import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, SelectField, TextField } from "@/components/admin/fields";
import { WizardNav } from "@/components/admin/WizardNav";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { TEMPLATE_KEYS, THEME_KEYS } from "@/modules/tenants/update";
import { updateAppearanceAction } from "../../actions";

export default async function TemplatePage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/modele">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, tThemes, tTemplates, tCommon, { tenant }] = await Promise.all([
    getTranslations("admin.tenant.appearance"),
    getTranslations("themes"),
    getTranslations("templates"),
    getTranslations("common"),
    loadTenantOverview(tenantId),
  ]);
  return (
    <>
      <WizardNav tenantId={tenantId} current="modele" active={assistant} />
      <Section title={t("title")}>
        <ActionForm action={updateAppearanceAction} submitLabel={tCommon("save")}>
          <Hidden
            values={{
              tenantId,
              primary: tenant.brand.colors?.primary ?? "#1f1f1f",
              secondary: tenant.brand.colors?.secondary ?? "#f5f1ea",
            }}
          />
          <TextField
            name="businessCategory"
            label={t("businessCategory")}
            hint={t("businessCategoryHint")}
            defaultValue={tenant.businessCategory}
          />
          <SelectField
            name="templateKey"
            label={t("template")}
            defaultValue={tenant.templateKey}
            options={TEMPLATE_KEYS.map((key) => ({ value: key, label: tTemplates(key) }))}
          />
          <SelectField
            name="theme"
            label={t("theme")}
            defaultValue={tenant.theme}
            options={THEME_KEYS.map((key) => ({
              value: key,
              label: tThemes(key),
            }))}
          />
        </ActionForm>
      </Section>
    </>
  );
}
