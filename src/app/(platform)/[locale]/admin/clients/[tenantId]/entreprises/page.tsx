import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, TextField } from "@/components/admin/fields";
import { Link } from "@/i18n/navigation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { connectState } from "@/modules/payments/connect";
import { createBusinessAction, updateBusinessAction } from "../../actions";

/** Entreprises d'un site : identité légale, gérante, compte Stripe ; ajout d'une entreprise. */
export default async function BusinessesPage({
  params,
}: PageProps<"/[locale]/admin/clients/[tenantId]/entreprises">) {
  const { tenantId } = await params;
  const [t, tOverview, tCommon, overview] = await Promise.all([
    getTranslations("admin.tenant.businesses"),
    getTranslations("admin.tenant.overview"),
    getTranslations("common"),
    loadTenantOverview(tenantId),
  ]);
  const fields = (business?: (typeof overview.businesses)[number]) => (
    <>
      <TextField name="name" label={t("name")} defaultValue={business?.name} required />
      <TextField name="legalName" label={t("legalName")} defaultValue={business?.legalName} />
      <TextField name="siret" inputMode="numeric" label={t("siret")} defaultValue={business?.siret} />
      <TextField name="vatNumber" label={t("vatNumber")} defaultValue={business?.vatNumber} />
      <TextField name="email" type="email" label={t("email")} defaultValue={business?.email} />
      <TextField name="phone" type="tel" label={t("phone")} defaultValue={business?.phone} />
      <TextField name="addressLine1" label={t("address1")} defaultValue={business?.addressLine1} />
      <TextField name="postalCode" label={t("postalCode")} defaultValue={business?.postalCode} />
      <TextField name="city" label={t("city")} defaultValue={business?.city} />
    </>
  );

  return (
    <>
      <p className="text-ink/80">{t("intro")}</p>
      {overview.businesses.map((business) => {
        const managers = overview.managers.filter((manager) => manager.businessId === business.id);
        return (
          <Section
            key={business.id}
            title={business.name}
            aside={
              <Link
                href={`/espace/${tenantId}/entreprise/${business.id}`}
                prefetch={false}
                className="font-semibold text-navy underline"
              >
                {t("viewAs")} →
              </Link>
            }
          >
            <div className="mb-4 space-y-1 text-sm text-ink/80">
              {business.isPrimary && <p className="font-semibold text-navy">{t("primary")}</p>}
              <p>
                {managers.length > 0
                  ? t("managers", {
                      names: managers.map((manager) => manager.name || manager.email).join(", "),
                    })
                  : t("noManager")}
              </p>
              <p>
                {t("stripe", {
                  state: tOverview(`stripeState.${connectState(business, overview.plan.features)}`),
                })}
              </p>
            </div>
            <ActionForm
              action={updateBusinessAction}
              submitLabel={tCommon("save")}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Hidden values={{ tenantId, businessId: business.id }} />
              {fields(business)}
            </ActionForm>
          </Section>
        );
      })}

      <Section title={t("add")}>
        <p className="mb-4 text-ink/80">{t("addHint")}</p>
        <ActionForm
          action={createBusinessAction}
          submitLabel={t("addSubmit")}
          resetOnSuccess
          className="grid gap-4 sm:grid-cols-2"
        >
          <Hidden values={{ tenantId }} />
          {fields()}
          <TextField name="managerEmail" type="email" label={t("managerEmail")} required />
          <TextField name="managerName" label={t("managerName")} />
        </ActionForm>
      </Section>
    </>
  );
}
