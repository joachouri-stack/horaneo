import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, SelectField, TextField } from "@/components/admin/fields";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { paymentGateway } from "@/lib/payments/stripe";
import { onlinePaymentReady } from "@/modules/payments/deposits";
import { getBookingSettings, SLOT_INTERVALS } from "@/modules/booking/settings";
import { planAllowsBooking } from "@/modules/billing/features";
import { centsToInput } from "@/lib/format";
import { getPlatformSetting } from "@/modules/settings";
import { updateSettingsAction } from "../../actions";

/** Durées proposées pour réserver à l'avance, plus la valeur actuelle si elle n'en fait pas partie. */
const ADVANCE_DAYS = [7, 14, 30, 60, 90, 180, 365];
const advanceOptions = (current: number) =>
  ADVANCE_DAYS.includes(current) ? ADVANCE_DAYS : [...ADVANCE_DAYS, current].sort((a, b) => a - b);

/** Réglages de la réservation en ligne, de l'acompte et des résumés : un seul bouton « Enregistrer ». */
export default async function SettingsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/reglages">) {
  const page = await managerPage(params);
  const [t, tCommon] = await Promise.all([getTranslations("manager.settings"), getTranslations("common")]);
  const [settings, reviewCooldownDays] = await page.db((tx) =>
    Promise.all([
      getBookingSettings(tx, page.tenantId),
      getPlatformSetting(tx, "review_request_cooldown_days"),
    ]),
  );
  const paymentAvailable = Boolean(page.tenant.features.onlinePayment);
  const stripeReady = onlinePaymentReady(page.business, page.tenant.features, paymentGateway());
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <ActionForm action={updateSettingsAction} submitLabel={tCommon("save")} className="space-y-6">
        <Hidden values={{ tenantId: page.tenantId }} />
        {/* Pack « site seul » : pas de réservation en ligne, on propose de changer de pack. */}
        {!planAllowsBooking(page.tenant.features) ? (
          <Section title={t("onlineTitle")}>
            <p className="font-semibold text-[#b4372a]">{t("onlineNotInPlan")}</p>
            <Link
              href={`/espace/${page.tenantId}/plus/abonnement`}
              className="font-semibold text-night underline"
            >
              {t("onlineUpgrade")} →
            </Link>
          </Section>
        ) : (
          <Section title={t("onlineTitle")}>
            <Hidden values={{ onlineBookingShown: "1" }} />
            <p
              className={`font-semibold ${settings.onlineBookingEnabled ? "text-success" : "text-[#b4372a]"}`}
            >
              {settings.onlineBookingEnabled ? t("onlineOn") : t("onlineOff")}
            </p>
            <CheckboxField
              name="onlineBookingEnabled"
              label={t("onlineEnabled")}
              defaultChecked={settings.onlineBookingEnabled}
            />
            <p className="text-sm text-ink/70">{t("onlineHelp")}</p>
          </Section>
        )}
        <Section title={t("booking")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="minNoticeHours"
              type="number"
              // Délai réglé en minutes : 30 min s'affiche 0,5 h et doit rester enregistrable.
              step="any"
              inputMode="decimal"
              label={t("minNotice")}
              defaultValue={settings.minNoticeMinutes / 60}
              required
            />
            <SelectField
              name="maxAdvanceDays"
              label={t("maxAdvance")}
              defaultValue={String(settings.maxAdvanceDays)}
              options={advanceOptions(settings.maxAdvanceDays).map((days) => ({
                value: String(days),
                label: t("advanceDays", { days: String(days) }),
              }))}
            />
            <SelectField
              name="slotIntervalMinutes"
              label={t("interval")}
              defaultValue={String(settings.slotIntervalMinutes)}
              options={SLOT_INTERVALS.map((value) => ({
                value: String(value),
                label: t("minutes", { count: value }),
              }))}
            />
            <SelectField
              name="maxServicesPerBooking"
              label={t("maxServices")}
              defaultValue={String(settings.maxServicesPerBooking)}
              options={["1", "2", "3"].map((value) => ({ value, label: value }))}
            />
            <TextField
              name="cancellationDeadlineHours"
              type="number"
              inputMode="numeric"
              label={t("cancellation")}
              defaultValue={settings.cancellationDeadlineHours}
              required
            />
          </div>
        </Section>
        <Section title={t("deposit")}>
          {paymentAvailable ? (
            <div className="space-y-4">
              <CheckboxField
                name="depositEnabled"
                label={t("depositEnabled")}
                defaultChecked={settings.depositEnabled}
              />
              {!stripeReady && (
                <p className="text-ink/80">
                  {t("depositNeedsStripe")}{" "}
                  <Link href={`${page.base}/plus/paiements`} className="font-semibold underline">
                    {t("depositStripeLink")}
                  </Link>
                </p>
              )}
              <p className="text-sm text-ink/70">{t("depositRefundRule")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  name="depositType"
                  label={t("depositType")}
                  defaultValue={settings.depositType}
                  options={[
                    { value: "percent", label: t("percent") },
                    { value: "fixed", label: t("fixed") },
                  ]}
                />
                <TextField
                  name="depositValue"
                  inputMode="decimal"
                  label={t("depositValue")}
                  defaultValue={
                    settings.depositType === "percent"
                      ? String(settings.depositValue)
                      : centsToInput(settings.depositValue)
                  }
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-ink/70">{t("depositUnavailable")}</p>
              <Hidden
                values={{
                  depositType: settings.depositType,
                  depositValue: String(
                    settings.depositType === "percent" ? settings.depositValue : settings.depositValue / 100,
                  ),
                }}
              />
            </>
          )}
        </Section>
        <Section title={t("summaries")}>
          <CheckboxField
            name="dailySummaryEnabled"
            label={t("daily")}
            defaultChecked={settings.dailySummaryEnabled}
          />
          <CheckboxField
            name="monthlySummaryEnabled"
            label={t("monthly")}
            defaultChecked={settings.monthlySummaryEnabled}
          />
        </Section>
        {/* Demande d'avis Google : seulement si le pack inclut les avis Google. */}
        {page.tenant.features.googleReviews && (
          <Section title={t("reviewsTitle")}>
            <CheckboxField
              name="reviewRequestEnabled"
              label={t("reviewRequest")}
              defaultChecked={settings.reviewRequestEnabled}
            />
            <p className="text-sm text-ink/70">
              {t("reviewRequestHelp", { months: Math.max(1, Math.round(reviewCooldownDays / 30)) })}
            </p>
            {!page.business.googlePlaceId && (
              <p className="mt-2 text-sm font-semibold text-[#b4372a]">{t("reviewRequestNoPlace")}</p>
            )}
          </Section>
        )}
      </ActionForm>
    </div>
  );
}
