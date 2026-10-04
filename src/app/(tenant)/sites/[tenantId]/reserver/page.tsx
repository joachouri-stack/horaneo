import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { PageTitle } from "@/components/site/blocks";
import { withTenant } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { paymentGateway } from "@/lib/payments/stripe";
import { getSite } from "@/lib/site/load";
import { isOnlineQuotaReached, loadBookingContext } from "@/modules/booking/availability";
import { onlinePaymentReady } from "@/modules/payments/deposits";
import { formatPhone } from "@/modules/phone";
import { hasActivePromoCodes } from "@/modules/promo/codes";
import { SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/reserver">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "booking" });
  return { title: t("title"), alternates: { canonical: SITE_PATHS.booking }, robots: { index: false } };
}

/**
 * Réservation en ligne. Si elle n'est pas possible (quota Basic atteint, aucune
 * prestation ou aucun membre), le téléphone est proposé, sans message d'erreur.
 */
export default async function BookingPage({ params, searchParams }: PageProps<"/sites/[tenantId]/reserver">) {
  const { tenantId } = await params;
  const site = await getSite(tenantId);
  const t = await getTranslations("booking");
  const query = await searchParams;
  const { context, quotaReached, promoEnabled } = await withTenant(tenantId, async (tx) => {
    const context = await loadBookingContext(tx, tenantId);
    return {
      context,
      quotaReached: await isOnlineQuotaReached(tx, context),
      promoEnabled: Boolean(context.features.promoCodes) && (await hasActivePromoCodes(tx, tenantId)),
    };
  });

  const bookable = context.services.filter(
    (service) =>
      service.isOnlineBookable && context.staff.some((member) => member.serviceIds.includes(service.id)),
  );

  if (quotaReached || bookable.length === 0) {
    return (
      <main id="contenu" className="mx-auto max-w-2xl px-4 py-12">
        <PageTitle title={t("unavailable.title")} />
        {site.tenant.phone ? (
          <p className="text-lg">
            {t("unavailable.text")}{" "}
            <a
              href={`tel:${site.tenant.phone}`}
              className="text-2xl font-semibold text-site-accent underline"
            >
              {formatPhone(site.tenant.phone)}
            </a>
          </p>
        ) : (
          <p className="text-lg">{t("unavailable.noPhone")}</p>
        )}
      </main>
    );
  }

  const categoryName = (id: string | null) => {
    const category = site.categories.find((item) => item.id === id);
    return category ? category.name : null;
  };
  const preselected =
    typeof query.prestation === "string" && bookable.some((s) => s.id === query.prestation)
      ? query.prestation
      : null;

  return (
    <main id="contenu" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 font-site-display text-4xl font-semibold text-site-accent">{t("title")}</h1>
      <BookingFlow
        locale={site.locale}
        timezone={context.tenant.timezone}
        currency={context.tenant.currency}
        services={bookable.map((service) => ({
          id: service.id,
          name: pickLocalized(service.name, site.locale),
          description: pickLocalized(service.description, site.locale),
          durationMinutes: service.durationMinutes,
          priceCents: service.priceCents,
          priceFrom: service.priceFrom,
          categoryName: categoryName(service.categoryId),
        }))}
        staff={context.staff.map((member) => ({
          id: member.id,
          name: member.name,
          serviceIds: member.serviceIds,
        }))}
        maxServices={context.settings.maxServicesPerBooking}
        preselectedServiceId={preselected}
        deposit={{
          // Acompte demandé seulement si le compte Stripe de l'établissement peut encaisser.
          enabled:
            context.settings.depositEnabled &&
            onlinePaymentReady(context.tenant, context.features, paymentGateway()),
          type: context.settings.depositType,
          value: context.settings.depositValue,
        }}
        promoEnabled={promoEnabled}
        holdMinutes={context.settings.holdMinutes}
        cancellationHours={context.settings.cancellationDeadlineHours}
        privacyPath={SITE_PATHS.privacy}
        managePath={SITE_PATHS.appointment}
      />
    </main>
  );
}
