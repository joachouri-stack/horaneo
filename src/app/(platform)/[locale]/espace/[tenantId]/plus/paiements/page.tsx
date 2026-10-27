import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { paymentGateway } from "@/lib/payments/stripe";
import { getBookingSettings } from "@/modules/booking/settings";
import type { AppErrorCode } from "@/modules/errors";
import { paymentSetup } from "@/modules/payments/connect";
import { getPlatformSetting } from "@/modules/settings";
import { refreshStripeAccount, startStripeOnboardingAction } from "../../actions";

/** Compte Stripe de l'établissement : ouverture guidée et état. */
export default async function PaymentsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/paiements">) {
  const page = await managerPage(params);
  const query = await searchParams;
  const [t, tErrors] = await Promise.all([getTranslations("manager.payments"), getTranslations("errors")]);
  const configured = paymentGateway() !== null;

  // Retour des étapes guidées de Stripe : l'état du compte est relu.
  let state = paymentSetup(page.business, page.tenant.features, configured);
  const returned = query.retour === "1";
  if (returned && configured && page.business.stripeAccountId) {
    state = await refreshStripeAccount(page.tenantId).catch(() => state);
  }
  const { settings, percent } = await page.db(async (tx) => ({
    settings: await getBookingSettings(tx, page.tenantId),
    percent: Number(await getPlatformSetting(tx, "deposit_commission_percent")),
  }));
  const error = typeof query.erreur === "string" ? (query.erreur as AppErrorCode) : null;
  const depositValue =
    settings.depositType === "percent" ? `${settings.depositValue} %` : page.fmt.money(settings.depositValue);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <p className="text-ink/80">{t("intro", { product: env().PRODUCT_NAME, percent })}</p>

      {error && (
        <p role="alert" className={ui.error}>
          {tErrors.has(error) ? tErrors(error) : tErrors("invalid")}
        </p>
      )}
      {returned && state !== "active" && <p className={ui.success}>{t("returned")}</p>}

      <section className={ui.card}>
        {/* Paiement en ligne pas encore configuré sur la plateforme : un seul message, jamais « compte actif ». */}
        <p className={`text-lg font-semibold ${state === "active" ? "text-success" : "text-night"}`}>
          {t(`state.${state}`)}
        </p>

        {state === "unavailable" && (
          <p className="mt-3">
            {t("upgrade")}{" "}
            <Link href={`${page.base}/plus/abonnement`} className="font-semibold underline">
              →
            </Link>
          </p>
        )}

        {(state === "not_started" || state === "incomplete") && (
          <form action={startStripeOnboardingAction} className="mt-4 space-y-3">
            <input type="hidden" name="tenantId" value={page.tenantId} />
            <p className="text-ink/80">{t("steps")}</p>
            <button type="submit" className={`${ui.primaryButton} w-full sm:w-auto`}>
              {state === "not_started" ? t("start") : t("resume")}
            </button>
          </form>
        )}

        {state === "active" && (
          <div className="mt-4 space-y-3">
            <p>{settings.depositEnabled ? t("depositOn", { value: depositValue }) : t("depositOff")}</p>
            <Link href={`${page.base}/plus/reglages`} className={`${ui.secondaryButton} w-full sm:w-auto`}>
              {t("settingsLink")}
            </Link>
            <p className="pt-2 text-ink/80">{t("dashboardHint")}</p>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className={`${ui.secondaryButton} w-full sm:w-auto`}
            >
              {t("dashboard")} ↗
            </a>
          </div>
        )}
      </section>

      {state !== "unavailable" && <p className="text-sm text-ink/70">{t("fees")}</p>}
    </div>
  );
}
