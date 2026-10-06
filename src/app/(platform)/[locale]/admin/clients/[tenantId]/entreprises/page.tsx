import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { pickLocalized } from "@/i18n/locales";
import { adminQuery } from "@/lib/admin/mutation";
import { listActiveAssets } from "@/modules/media/assets";
import { Link } from "@/i18n/navigation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { connectState } from "@/modules/payments/connect";
import {
  addBusinessManagerAction,
  createBusinessAction,
  setOnlineBookingAdminAction,
  updateBusinessAction,
  updateBusinessProfileAction,
} from "../../actions";
import { onlineBookingByBusiness } from "@/modules/booking/settings";

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
  const [photos, booking] = await Promise.all([
    adminQuery((tx) => listActiveAssets(tx, tenantId)),
    adminQuery((tx) => onlineBookingByBusiness(tx, tenantId)),
  ]);
  const locale = overview.tenant.defaultLocale as "fr";
  const photoOptions = [
    { value: "", label: t("noPhoto") },
    ...photos
      .filter((photo) => photo.kind !== "logo")
      .map((photo, index) => ({
        value: photo.id,
        label: pickLocalized(photo.alt, locale) || `Photo ${index + 1}`,
      })),
  ];
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
      {business && (
        <TextField
          id={`place-${business.id}`}
          name="googlePlaceId"
          label={t("googlePlaceId")}
          hint={t("googlePlaceIdHint")}
          defaultValue={business.googlePlaceId}
        />
      )}
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
                className="font-semibold text-night underline"
              >
                {t("viewAs")} →
              </Link>
            }
          >
            <div className="mb-4 space-y-1 text-sm text-ink/80">
              {business.isPrimary && <p className="font-semibold text-night">{t("primary")}</p>}
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
            {managers.length === 0 && (
              <div className="mb-6 rounded-xl bg-navy/5 p-4">
                <h3 className="font-bold">{t("addManager")}</h3>
                <p className="mb-3 text-sm text-ink/70">{t("addManagerHint")}</p>
                <ActionForm
                  action={addBusinessManagerAction}
                  submitLabel={t("addManagerSubmit")}
                  resetOnSuccess
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <Hidden values={{ tenantId, businessId: business.id }} />
                  <TextField
                    id={`manager-email-${business.id}`}
                    name="managerEmail"
                    type="email"
                    label={t("managerEmail")}
                    required
                  />
                  <TextField id={`manager-name-${business.id}`} name="managerName" label={t("managerName")} />
                </ActionForm>
              </div>
            )}
            <ActionForm
              action={updateBusinessAction}
              submitLabel={tCommon("save")}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Hidden values={{ tenantId, businessId: business.id }} />
              {fields(business)}
            </ActionForm>
            <div className="mt-6 border-t border-navy/10 pt-6">
              <h3 className="text-lg font-bold">{t("onlineBooking")}</h3>
              <ActionForm
                action={setOnlineBookingAdminAction}
                submitLabel={tCommon("save")}
                className="mt-2 space-y-2"
              >
                <Hidden values={{ tenantId, businessId: business.id }} />
                <CheckboxField
                  name="onlineBookingEnabled"
                  label={t("onlineBookingEnabled")}
                  defaultChecked={booking.get(business.id) ?? true}
                />
                <p className="text-sm text-ink/70">{t("onlineBookingHint")}</p>
              </ActionForm>
            </div>
            <div className="mt-6 border-t border-navy/10 pt-6">
              <h3 className="text-lg font-bold">{t("profile")}</h3>
              <p className="mb-4 text-sm text-ink/70">{t("profileHint")}</p>
              <ActionForm
                action={updateBusinessProfileAction}
                submitLabel={t("saveProfile")}
                className="grid gap-4 sm:grid-cols-2"
              >
                <Hidden values={{ tenantId, businessId: business.id }} />
                <TextField
                  id={`slug-${business.id}`}
                  name="slug"
                  label={t("slug")}
                  hint={t("slugHint")}
                  defaultValue={business.slug}
                />
                <TextField
                  id={`title-${business.id}`}
                  name="title"
                  label={t("pageTitle")}
                  defaultValue={pickLocalized(business.profile.title, locale)}
                />
                <TextField
                  id={`role-${business.id}`}
                  name="role"
                  label={t("role")}
                  defaultValue={pickLocalized(business.profile.role, locale)}
                />
                <TextField
                  id={`availability-${business.id}`}
                  name="availability"
                  label={t("availability")}
                  defaultValue={pickLocalized(business.profile.availability, locale)}
                />
                <TextArea
                  id={`bio-${business.id}`}
                  name="bio"
                  label={t("bio")}
                  rows={3}
                  defaultValue={pickLocalized(business.profile.bio, locale)}
                />
                <TextArea
                  id={`quote-${business.id}`}
                  name="quote"
                  label={t("quote")}
                  hint={t("quoteHint")}
                  rows={3}
                  defaultValue={pickLocalized(business.profile.quote, locale)}
                />
                <SelectField
                  id={`photo-${business.id}`}
                  name="photoAssetId"
                  label={t("photo")}
                  options={photoOptions}
                  defaultValue={business.profile.photoAssetId ?? ""}
                />
              </ActionForm>
            </div>
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
