import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, SelectField, ToggleField } from "@/components/admin/fields";
import { DepositFields } from "@/components/manager/DepositFields";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { paymentGateway } from "@/lib/payments/stripe";
import { paymentSetup } from "@/modules/payments/connect";
import { BREAK_MINUTES, getBookingSettings, SLOT_INTERVALS } from "@/modules/booking/settings";
import { planAllowsBooking } from "@/modules/billing/features";
import { centsToInput } from "@/lib/format";
import { getPlatformSetting } from "@/modules/settings";
import { updateSettingsAction } from "../../actions";

/** Durées proposées pour réserver à l'avance, plus la valeur actuelle si elle n'en fait pas partie. */
const ADVANCE_DAYS = [7, 14, 30, 60, 90, 180, 365];
const advanceOptions = (current: number) =>
  ADVANCE_DAYS.includes(current) ? ADVANCE_DAYS : [...ADVANCE_DAYS, current].sort((a, b) => a - b);

/** Délais proposés (en minutes) pour réserver au plus tard, plus la valeur actuelle. */
const NOTICE_MINUTES = [0, 30, 60, 120, 240, 720, 1440, 2880];
/** Délais proposés (en heures) pour annuler ou déplacer en ligne, plus la valeur actuelle. */
const CANCELLATION_HOURS = [0, 2, 12, 24, 48, 72];
const withCurrent = (list: number[], current: number) =>
  list.includes(current) ? list : [...list, current].sort((a, b) => a - b);

/** Réglages de la réservation en ligne, de l'acompte et des résumés : un seul bouton « Enregistrer ». */
export default async function SettingsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/reglages">) {
  const page = await managerPage(params, "owner");
  const [t, tCommon] = await Promise.all([getTranslations("manager.settings"), getTranslations("common")]);
  const [settings, reviewCooldownDays, dailyTime, monthlyTime] = await page.db((tx) =>
    Promise.all([
      getBookingSettings(tx, page.tenantId),
      getPlatformSetting(tx, "review_request_cooldown_days"),
      getPlatformSetting(tx, "daily_summary_time"),
      getPlatformSetting(tx, "monthly_summary_time"),
    ]),
  );
  // Heures d'envoi des résumés (réglages de la plateforme), écrites à la française : « 19 h ».
  const hourLabel = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return new Intl.DateTimeFormat(page.locale, {
      hour: "numeric",
      minute: minutes ? "2-digit" : undefined,
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
  };
  /** « 30 minutes avant », « 2 heures avant », « jusqu'au dernier moment ». */
  const delayLabel = (minutes: number) =>
    minutes === 0
      ? t("delayNone")
      : minutes % 60 === 0
        ? t("delayHours", { count: minutes / 60 })
        : t("delayMinutes", { count: minutes });
  const paymentAvailable = Boolean(page.tenant.features.onlinePayment);
  const bookingOff = planAllowsBooking(page.tenant.features) && !settings.onlineBookingEnabled;
  const payment = paymentSetup(page.business, page.tenant.features, paymentGateway() !== null);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <ActionForm
        action={updateSettingsAction}
        submitLabel={tCommon("save")}
        className="space-y-6"
        stickySubmit
        stickyBottomClass="bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] lg:bottom-0"
      >
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
            <ToggleField
              name="onlineBookingEnabled"
              label={t("onlineEnabled")}
              hint={t("onlineHelp")}
              defaultChecked={settings.onlineBookingEnabled}
            />
          </Section>
        )}
        {/* Règles rarement modifiées : repliées. */}
        <Section title={t("booking")} collapsible>
          {bookingOff && <p className="text-sm text-ink/70">{t("bookingOffNote")}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="minNoticeHours"
              label={t("minNotice")}
              // Délai enregistré en minutes, envoyé en heures (30 min = 0,5).
              defaultValue={String(settings.minNoticeMinutes / 60)}
              options={withCurrent(NOTICE_MINUTES, settings.minNoticeMinutes).map((minutes) => ({
                value: String(minutes / 60),
                label: delayLabel(minutes),
              }))}
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
              name="breakMinutes"
              label={t("break")}
              hint={t("breakHint")}
              defaultValue={String(settings.breakMinutes)}
              options={BREAK_MINUTES.map((value) => ({
                value: String(value),
                label:
                  value === 0
                    ? t("breakNone")
                    : value % 60 === 0
                      ? t("breakHours", { count: value / 60 })
                      : t("minutes", { count: value }),
              }))}
            />
            <SelectField
              name="maxServicesPerBooking"
              label={t("maxServices")}
              defaultValue={String(settings.maxServicesPerBooking)}
              options={["1", "2", "3"].map((value) => ({ value, label: value }))}
            />
            <SelectField
              name="cancellationDeadlineHours"
              label={t("cancellation")}
              defaultValue={String(settings.cancellationDeadlineHours)}
              options={withCurrent(CANCELLATION_HOURS, settings.cancellationDeadlineHours).map((hours) => ({
                value: String(hours),
                label: delayLabel(hours * 60),
              }))}
            />
          </div>
        </Section>
        <Section title={t("deposit")}>
          {paymentAvailable ? (
            <DepositFields
              enabled={settings.depositEnabled}
              type={settings.depositType}
              value={
                settings.depositType === "percent"
                  ? String(settings.depositValue)
                  : centsToInput(settings.depositValue)
              }
              currency={page.fmt.currency}
            >
              {payment === "platform_off" && <p className="text-ink/80">{t("depositPlatformOff")}</p>}
              {(payment === "not_started" || payment === "incomplete") && (
                <p className="text-ink/80">
                  {t("depositNeedsStripe")}{" "}
                  <Link href={`${page.base}/plus/paiements`} className="font-semibold underline">
                    {t(payment === "not_started" ? "depositStripeLink" : "depositStripeResume")}
                  </Link>
                </p>
              )}
              <p className="text-sm text-ink/70">
                {t("depositRefundRule", { hours: settings.cancellationDeadlineHours })}
              </p>
            </DepositFields>
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
          <p className="text-sm text-ink/70">{t("summariesTo", { email: page.session.user.email })}</p>
          <ToggleField
            name="dailySummaryEnabled"
            label={t("daily", { time: hourLabel(String(dailyTime)) })}
            defaultChecked={settings.dailySummaryEnabled}
          />
          {/* Bilan du mois : seulement si le pack l'envoie. */}
          {page.tenant.features.monthlySummary && (
            <ToggleField
              name="monthlySummaryEnabled"
              label={t("monthly", { time: hourLabel(String(monthlyTime)) })}
              defaultChecked={settings.monthlySummaryEnabled}
            />
          )}
        </Section>
        {/* Demande d'avis Google : seulement si le pack inclut les avis Google. */}
        {page.tenant.features.googleReviews && (
          <Section title={t("reviewsTitle")}>
            <ToggleField
              name="reviewRequestEnabled"
              label={t("reviewRequest")}
              hint={t("reviewRequestHelp", { months: Math.max(1, Math.round(reviewCooldownDays / 30)) })}
              defaultChecked={settings.reviewRequestEnabled}
            />
            {!page.business.googlePlaceId && (
              <p className="mt-2 text-sm font-semibold text-[#b4372a]">
                {t.rich("reviewRequestNoPlace", {
                  link: (chunks) => (
                    <Link href={`${page.base}/plus/demandes`} className="underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            )}
          </Section>
        )}
      </ActionForm>
    </div>
  );
}
