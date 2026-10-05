import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { env } from "@/config/env";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { paymentGateway } from "@/lib/payments/stripe";
import { getBookingSettings } from "@/modules/booking/settings";
import type { AppErrorCode } from "@/modules/errors";
import { connectState } from "@/modules/payments/connect";
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
  let state = connectState(page.business, page.tenant.features);
  const returned = query.retour === "1";
  if (returned && configured && page.business.stripeAccountId) {
    state = await refreshStripeAccount(page.tenantId).catch(() => state);
  }
  const settings = await page.db((tx) => getBookingSettings(tx, page.tenantId));
  const error = typeof query.erreur === "string" ? (query.erreur as AppErrorCode) : null;
  const depositValue =
    settings.depositType === "percent" ? `${settings.depositValue} %` : page.fmt.money(settings.depositValue);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="text-ink/80">{t("intro", { product: env().PRODUCT_NAME })}</p>

      {error && (
        <p role="alert" className={ui.error}>
          {tErrors.has(error) ? tErrors(error) : tErrors("invalid")}
        </p>
      )}
      {returned && state !== "active" && <p className={ui.success}>{t("returned")}</p>}

      <section className={ui.card}>
        {/* Paiement en ligne pas encore configuré sur la plateforme : un seul message, jamais « compte actif ». */}
        {(configured || state === "unavailable") && (
          <p className={`text-lg font-bold ${state === "active" ? "text-success" : "text-navy"}`}>
            {t(`state.${state}`)}
          </p>
        )}

        {state === "unavailable" && (
          <p className="mt-3">
            {t("upgrade")}{" "}
            <Link href={`${page.base}/plus/abonnement`} className="font-semibold underline">
              →
            </Link>
          </p>
        )}

        {state !== "unavailable" && !configured && (
          <p className="text-lg font-bold text-navy">{t("notConfigured")}</p>
        )}

        {(state === "not_started" || state === "incomplete") && configured && (
          <form action={startStripeOnboardingAction} className="mt-4 space-y-3">
            <input type="hidden" name="tenantId" value={page.tenantId} />
            <p className="text-ink/80">{t("steps")}</p>
            <button type="submit" className={`${ui.primaryButton} w-full sm:w-auto`}>
              {state === "not_started" ? t("start") : t("resume")}
            </button>
          </form>
        )}

        {state === "active" && configured && (
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
