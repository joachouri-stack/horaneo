import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SectionTitle } from "@/components/site/atelier/ui";
import { PageTitle } from "@/components/site/blocks";
import { withTenant } from "@/db/access";
import { formatMoney } from "@/lib/format";
import { paymentGateway } from "@/lib/payments/stripe";
import { getSite } from "@/lib/site/load";
import { loadBookingContext } from "@/modules/booking/availability";
import { onlinePaymentReady } from "@/modules/payments/deposits";
import { isAtelier } from "@/modules/site/data";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/conditions-annulation">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.cancellation" });
  return { title: t("title"), alternates: { canonical: SITE_PATHS.cancellation } };
}

/**
 * Conditions d'annulation, lues dans les réglages de chaque entreprise (délai,
 * acompte) : toujours à jour, rien à rédiger.
 */
export default async function CancellationPage({
  params,
}: PageProps<"/sites/[tenantId]/conditions-annulation">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const t = await getTranslations("site.cancellation");
  const gateway = paymentGateway();
  const rules = await Promise.all(
    site.businesses.map(async (business) => {
      const context = await withTenant(
        tenantId,
        (tx) => loadBookingContext(tx, tenantId),
        undefined,
        business.id,
      ).catch(() => null);
      if (!context) return null;
      const { settings } = context;
      const deposit =
        settings.depositEnabled && onlinePaymentReady(context.business, context.features, gateway)
          ? settings.depositType === "percent"
            ? t("percent", { value: settings.depositValue })
            : formatMoney(settings.depositValue, site.tenant.currency, site.locale)
          : null;
      return { business, hours: settings.cancellationDeadlineHours, deposit };
    }),
  );
  const multi = site.businesses.length > 1;

  return (
    <main id="contenu" className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
      {isAtelier(site) ? (
        <SectionTitle as="h1" start={t("title")} className="mb-6" />
      ) : (
        <PageTitle title={t("title")} />
      )}
      <p className="text-lg text-site-muted">{t("intro")}</p>
      <div className="mt-8 space-y-5">
        {rules.map(
          (rule) =>
            rule && (
              <section
                key={rule.business.id}
                className="rounded-[1.5rem] border border-site-border bg-site-panel p-6"
              >
                {multi && (
                  <h2 className="mb-3 font-site-display text-2xl font-semibold text-site-heading">
                    {rule.business.title
                      ? `${rule.business.title} · ${rule.business.name}`
                      : rule.business.name}
                  </h2>
                )}
                <ul className="list-disc space-y-2 pl-5">
                  <li>{t("free", { hours: rule.hours })}</li>
                  <li>{t("late", { name: multi ? rule.business.name : site.tenant.name })}</li>
                  {rule.deposit ? (
                    <>
                      <li>
                        {t("deposit", {
                          amount: rule.deposit,
                          name: multi ? rule.business.name : site.tenant.name,
                        })}
                      </li>
                      <li>{t("depositRefund")}</li>
                    </>
                  ) : (
                    <li>{t("noDeposit")}</li>
                  )}
                </ul>
              </section>
            ),
        )}
      </div>
    </main>
  );
}
