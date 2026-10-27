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
  removeBusinessLogoAction,
  replaceBusinessManagerAction,
  uploadBusinessLogoAction,
} from "../../actions";
import { saveBusinessAction } from "./actions";
import { ui } from "@/components/ui/styles";
import { storage } from "@/lib/storage";
import { onlineBookingByBusiness } from "@/modules/booking/settings";
import { formatDateTime } from "@/lib/format";
import { googlePlacesProvider } from "@/lib/reviews/google-places";
import { reviewsCacheByBusiness, reviewsStatus, type ReviewsStatus } from "@/modules/reviews/google";

/** Entreprises d'un site : identité légale, gérante, paiement par carte ; ajout d'une entreprise. */
export default async function BusinessesPage({
  params,
}: PageProps<"/[locale]/admin/clients/[tenantId]/entreprises">) {
  const { tenantId } = await params;
  const [t, tPhotos, tOverview, tReviews, overview] = await Promise.all([
    getTranslations("admin.tenant.businesses"),
    getTranslations("admin.tenant.photos"),
    getTranslations("admin.tenant.overview"),
    getTranslations("admin.tenant.businesses.reviews"),
    loadTenantOverview(tenantId),
  ]);
  const [photos, booking, reviewsCache] = await Promise.all([
    adminQuery((tx) => listActiveAssets(tx, tenantId)),
    adminQuery((tx) => onlineBookingByBusiness(tx, tenantId)),
    adminQuery((tx) => reviewsCacheByBusiness(tx, tenantId)),
  ]);
  const locale = overview.tenant.defaultLocale as "fr";
  const keyConfigured = googlePlacesProvider() !== null;
  const photoOptions = [
    { value: "", label: t("noPhoto") },
    ...photos
      .filter((photo) => photo.kind !== "logo")
      .map((photo, index) => ({
        value: photo.id,
        label: pickLocalized(photo.alt, locale) || tPhotos("number", { n: index + 1 }),
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

  // Clé Google absente : un seul avertissement en haut de la page, pas un par entreprise.
  const statusOf = (business: (typeof overview.businesses)[number]) =>
    reviewsStatus({
      placeId: business.googlePlaceId,
      inPlan: Boolean(overview.plan.features.googleReviews),
      keyConfigured,
      siteActive: overview.tenant.status === "active",
      cache: reviewsCache.get(business.id),
    });
  const noGoogleKey = overview.businesses.some((business) => statusOf(business)?.state === "noKey");

  return (
    <>
      <p className="text-ink/80">{t("intro")}</p>
      {noGoogleKey && <p className="text-sm font-semibold text-night">{tReviews("noKey")}</p>}
      {overview.businesses.map((business, index) => {
        const managers = overview.managers.filter((manager) => manager.businessId === business.id);
        const status = statusOf(business);
        return (
          // Une entreprise par bloc repliable ; la première est dépliée.
          <details key={business.id} className={`${ui.card} group`} open={index === 0}>
            <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">{business.name}</h2>
                <p className="text-sm text-ink/70">
                  {[
                    business.isPrimary ? t("primary") : null,
                    managers.length > 0
                      ? t("managers", {
                          names: managers.map((manager) => manager.name || manager.email).join(", "),
                        })
                      : t("noManager"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span aria-hidden="true" className="text-navy/50 transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <div className="mt-4 mb-6 space-y-1 text-sm text-ink/80">
              <p>
                {t("stripe", {
                  state: tOverview(`stripeState.${connectState(business, overview.plan.features)}`),
                })}
              </p>
              <GoogleReviewsStatus
                status={status?.state === "noKey" ? null : status}
                locale={overview.tenant.defaultLocale}
                timeZone={overview.tenant.timezone}
              />
              <Link
                href={`/espace/${tenantId}/entreprise/${business.id}`}
                prefetch={false}
                className="inline-flex min-h-11 items-center font-semibold text-night underline"
              >
                {t("viewAs")} →
              </Link>
            </div>

            {/* 1. Les informations de l'entreprise : un seul formulaire, un seul bouton. */}
            <ActionForm
              action={saveBusinessAction}
              submitLabel={t("saveBusiness")}
              successMessage={t("businessSaved")}
              className="space-y-6"
            >
              <Hidden values={{ tenantId, businessId: business.id }} />
              <fieldset className="space-y-4">
                <legend className="mb-2 text-lg font-bold">{t("detailsTitle")}</legend>
                <div className="grid gap-4 sm:grid-cols-2">{fields(business)}</div>
              </fieldset>
              <div className="space-y-2 border-t border-navy/10 pt-6">
                <h3 className="text-lg font-bold">{t("onlineBooking")}</h3>
                <CheckboxField
                  name="onlineBookingEnabled"
                  label={t("onlineBookingEnabled")}
                  defaultChecked={booking.get(business.id) ?? true}
                />
                <p className="text-sm text-ink/70">{t("onlineBookingHint")}</p>
              </div>
              {/* Page publique de l'entreprise : repliée, on l'ouvre pour la modifier. */}
              <details className="border-t border-navy/10 pt-6">
                <summary className="cursor-pointer py-2 text-lg font-bold">{t("profile")}</summary>
                <p className="mt-2 mb-4 text-sm text-ink/70">{t("profileHint")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    id={`shop-${business.id}`}
                    name="shopName"
                    label={t("shopName")}
                    hint={t("shopNameHint")}
                    defaultValue={business.profile.shopName ?? ""}
                  />
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
                  <TextField
                    id={`instagram-${business.id}`}
                    name="instagram"
                    inputMode="url"
                    label={t("instagram")}
                    hint={t("socialHint")}
                    placeholder={t("instagramPlaceholder")}
                    defaultValue={business.profile.social?.instagram}
                  />
                  <TextField
                    id={`facebook-${business.id}`}
                    name="facebook"
                    inputMode="url"
                    label={t("facebook")}
                    placeholder={t("facebookPlaceholder")}
                    defaultValue={business.profile.social?.facebook}
                  />
                  <SelectField
                    id={`photo-${business.id}`}
                    name="photoAssetId"
                    label={t("photo")}
                    options={photoOptions}
                    defaultValue={business.profile.photoAssetId ?? ""}
                  />
                </div>
              </details>
            </ActionForm>

            {/* 2. Son logo : une image envoyée tout de suite, à part. */}
            <BusinessLogoBox
              tenantId={tenantId}
              businessId={business.id}
              logo={photos.find((photo) => photo.id === business.profile.logoAssetId)}
            />

            {/* 3. L'accès à son espace : sans gérante on le donne, sinon on la remplace (repliée). */}
            <details className="mt-6 rounded-xl bg-navy/5 p-4" open={managers.length === 0}>
              <summary className="cursor-pointer py-2.5 font-bold">
                {t(managers.length === 0 ? "addManager" : "replaceManager")}
              </summary>
              <p className="mt-2 mb-3 text-sm text-ink/70">
                {t(managers.length === 0 ? "addManagerHint" : "replaceManagerHint")}
              </p>
              <ActionForm
                action={managers.length === 0 ? addBusinessManagerAction : replaceBusinessManagerAction}
                submitLabel={t(managers.length === 0 ? "addManagerSubmit" : "replaceManagerSubmit")}
                confirm={managers.length === 0 ? undefined : t("replaceManagerConfirm")}
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
            </details>
          </details>
        );
      })}

      <Section title={t("add")} collapsible>
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

/**
 * Logo propre à une professionnelle : affiché à côté de son nom sur sa carte et sa page du
 * site (modèle Atelier). Le logo est gardé entier ; l'envoi l'enregistre tout de suite.
 */
async function BusinessLogoBox({
  tenantId,
  businessId,
  logo,
}: {
  tenantId: string;
  businessId: string;
  logo?: { storageKey: string };
}) {
  const t = await getTranslations("admin.tenant.businesses");
  return (
    <div className="mt-6 rounded-xl border border-accent-line bg-accent-soft/40 p-4">
      <h3 className="font-bold text-night">{t("logoTitle")}</h3>
      <p className="mt-1 mb-4 text-sm text-ink/70">{t("logoHint")}</p>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={storage().publicUrl(logo.storageKey)}
              alt={t("logoCurrent")}
              className="h-24 w-24 rounded-full border border-navy/10 bg-white object-contain"
            />
          ) : (
            <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-navy/20 bg-white px-2 text-center text-sm text-ink/60">
              {t("noLogo")}
            </span>
          )}
          {logo && (
            <ActionForm
              action={removeBusinessLogoAction}
              submitLabel={t("logoRemove")}
              variant="link"
              confirm={t("logoRemoveConfirm")}
              className=""
            >
              <Hidden values={{ tenantId, businessId }} />
            </ActionForm>
          )}
        </div>
        <ActionForm
          action={uploadBusinessLogoAction}
          submitLabel={t(logo ? "logoReplace" : "logoSubmit")}
          variant="secondary"
          resetOnSuccess
          className="min-w-0 flex-1 space-y-3"
        >
          <Hidden values={{ tenantId, businessId }} />
          <div>
            <label htmlFor={`business-logo-${businessId}`} className="font-semibold text-night">
              {t("logoFile")}
            </label>
            <input
              id={`business-logo-${businessId}`}
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
              required
              className={`mt-2 ${ui.fileInput}`}
            />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}

/** Pourquoi les avis Google d'une entreprise s'affichent ou non sur le site. */
async function GoogleReviewsStatus({
  status,
  locale,
  timeZone,
}: {
  status: ReviewsStatus | null;
  locale: string;
  timeZone: string;
}) {
  if (!status) return null;
  const t = await getTranslations("admin.tenant.businesses.reviews");
  const date = (value: Date) => formatDateTime(value, locale, timeZone);
  const error =
    "error" in status && status.error
      ? t("error", { date: date(status.errorAt), error: status.error })
      : null;
  let summary: string;
  if (status.state === "shown") {
    summary =
      status.rating === null
        ? t("shownNoRating", { date: date(status.fetchedAt) })
        : t("shown", {
            rating: new Intl.NumberFormat(locale, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }).format(status.rating),
            count: status.total,
            date: date(status.fetchedAt),
          });
  } else if (status.state === "stale") {
    summary = t("stale", { date: date(status.fetchedAt) });
  } else {
    summary = t(status.state);
  }
  return (
    <>
      <p className={status.state === "shown" ? undefined : "font-semibold text-night"}>{summary}</p>
      {error && <p className="text-coral-dark">{error}</p>}
    </>
  );
}
