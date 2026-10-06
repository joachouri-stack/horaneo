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
import { setOnlineBookingAction, updateSettingsAction } from "../../actions";

/** Réglages de la réservation en ligne, de l'acompte et des résumés. */
export default async function SettingsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/reglages">) {
  const page = await managerPage(params);
  const [t, tCommon] = await Promise.all([getTranslations("manager.settings"), getTranslations("common")]);
  const settings = await page.db((tx) => getBookingSettings(tx, page.tenantId));
  const paymentAvailable = Boolean(page.tenant.features.onlinePayment);
  const stripeReady = onlinePaymentReady(page.business, page.tenant.features, paymentGateway());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      {/* Pack « site seul » : pas de réservation en ligne, on propose de changer de pack. */}
      {!planAllowsBooking(page.tenant.features) ? (
        <Section title={t("onlineTitle")}>
          <p className="font-semibold text-coral-dark">{t("onlineNotInPlan")}</p>
          <Link
            href={`/espace/${page.tenantId}/plus/abonnement`}
            className="font-semibold text-night underline"
          >
            {t("onlineUpgrade")} →
          </Link>
        </Section>
      ) : (
        <ActionForm action={setOnlineBookingAction} submitLabel={tCommon("save")} className="space-y-3">
          <Hidden values={{ tenantId: page.tenantId }} />
          <Section title={t("onlineTitle")}>
            <p
              className={`font-semibold ${settings.onlineBookingEnabled ? "text-success" : "text-coral-dark"}`}
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
        </ActionForm>
      )}
      <ActionForm action={updateSettingsAction} submitLabel={tCommon("save")} className="space-y-6">
        <Hidden values={{ tenantId: page.tenantId }} />
        <Section title={t("booking")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="minNoticeHours"
              type="number"
              inputMode="numeric"
              label={t("minNotice")}
              defaultValue={settings.minNoticeMinutes / 60}
              required
            />
            <TextField
              name="maxAdvanceDays"
              type="number"
              inputMode="numeric"
              label={t("maxAdvance")}
              defaultValue={settings.maxAdvanceDays}
              required
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
      </ActionForm>
    </div>
  );
}
