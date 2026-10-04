import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, TextField } from "@/components/admin/fields";
import { WizardNav } from "@/components/admin/WizardNav";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { updateIdentityAction, updateSocialAction } from "../../actions";

export default async function IdentityPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/coordonnees">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, tCreate, tCommon, { tenant }] = await Promise.all([
    getTranslations("admin.tenant.identity"),
    getTranslations("admin.create"),
    getTranslations("common"),
    loadTenantOverview(tenantId),
  ]);
  return (
    <>
      <WizardNav tenantId={tenantId} current="coordonnees" active={assistant} />
      <Section title={t("title")}>
        <ActionForm
          action={updateIdentityAction}
          submitLabel={tCommon("save")}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Hidden values={{ tenantId }} />
          <TextField name="name" label={tCreate("name")} defaultValue={tenant.name} required />
          <TextField name="slug" label={tCreate("slug")} defaultValue={tenant.slug} required />
          <TextField name="phone" type="tel" label={tCreate("phone")} defaultValue={tenant.phone} />
          <TextField name="email" type="email" label={tCreate("email")} defaultValue={tenant.email} />
          <TextField name="addressLine1" label={t("address1")} defaultValue={tenant.addressLine1} />
          <TextField name="addressLine2" label={t("address2")} defaultValue={tenant.addressLine2} />
          <TextField name="postalCode" label={t("postalCode")} defaultValue={tenant.postalCode} />
          <TextField name="city" label={t("city")} defaultValue={tenant.city} />
          <TextField name="country" label={t("country")} defaultValue={tenant.country} required />
          <TextField name="timezone" label={t("timezone")} defaultValue={tenant.timezone} required />
          <TextField
            name="latitude"
            inputMode="decimal"
            label={t("latitude")}
            hint={t("coordinatesHint")}
            defaultValue={tenant.latitude}
          />
          <TextField
            name="longitude"
            inputMode="decimal"
            label={t("longitude")}
            defaultValue={tenant.longitude}
          />
        </ActionForm>
      </Section>
      <Section title={t("social")}>
        <ActionForm
          action={updateSocialAction}
          submitLabel={tCommon("save")}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Hidden values={{ tenantId }} />
          <TextField
            name="instagram"
            type="url"
            label={t("instagram")}
            defaultValue={tenant.brand.social?.instagram}
          />
          <TextField
            name="facebook"
            type="url"
            label={t("facebook")}
            defaultValue={tenant.brand.social?.facebook}
          />
        </ActionForm>
      </Section>
    </>
  );
}
