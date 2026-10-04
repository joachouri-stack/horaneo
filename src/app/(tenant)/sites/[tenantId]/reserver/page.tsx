import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { PageTitle } from "@/components/site/blocks";
import { withTenant } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { paymentGateway } from "@/lib/payments/stripe";
import Link from "next/link";
import { SiteImage } from "@/components/site/SiteImage";
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

  // Site à plusieurs entreprises : la cliente choisit d'abord avec qui elle réserve
  // (ou l'entreprise découle de la prestation choisie sur le site).
  const requestedService = site.services.find((service) => service.id === query.prestation);
  const business =
    site.businesses.length === 1
      ? site.businesses[0]
      : site.businesses.find(
          (item) => item.id === (requestedService ? requestedService.businessId : query.avec),
        );
  if (!business) {
    return (
      <main id="contenu" className="mx-auto max-w-3xl px-4 py-10">
        <PageTitle title={t("business.title")} intro={t("business.intro")} />
        <ul className="grid gap-4 sm:grid-cols-2">
          {site.businesses.map((item) => {
            const team = site.staff.filter((member) => member.businessId === item.id);
            const names = team.map((member) => member.name).filter((name) => name !== item.name);
            const photo = team.find((member) => member.photo)?.photo;
            return (
              <li key={item.id}>
                <Link
                  href={`${SITE_PATHS.booking}?avec=${item.id}`}
                  className="flex h-full flex-col gap-3 rounded-site border border-site-border bg-site-surface p-5 hover:border-site-accent"
                >
                  {photo && (
                    <SiteImage
                      image={photo}
                      alt=""
                      sizes="80px"
                      className="h-20 w-20 rounded-full object-cover"
                    />
                  )}
                  <span className="font-site-display text-2xl font-semibold text-site-accent">
                    {item.name}
                  </span>
                  {names.length > 0 && <span className="text-site-muted">{names.join(", ")}</span>}
                  <span className="mt-auto font-semibold underline">
                    {t("business.choose", { name: item.name })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    );
  }

  const { context, quotaReached, promoEnabled } = await withTenant(
    tenantId,
    async (tx) => {
      const context = await loadBookingContext(tx, tenantId);
      return {
        context,
        quotaReached: await isOnlineQuotaReached(tx, context),
        promoEnabled: Boolean(context.features.promoCodes) && (await hasActivePromoCodes(tx, tenantId)),
      };
    },
    undefined,
    business.id,
  );
  const phone = business.phone ?? site.tenant.phone;

  const bookable = context.services.filter(
    (service) =>
      service.isOnlineBookable && context.staff.some((member) => member.serviceIds.includes(service.id)),
  );

  if (quotaReached || bookable.length === 0) {
    return (
      <main id="contenu" className="mx-auto max-w-2xl px-4 py-12">
        <PageTitle title={t("unavailable.title")} />
        {phone ? (
          <p className="text-lg">
            {t("unavailable.text")}{" "}
            <a href={`tel:${phone}`} className="text-2xl font-semibold text-site-accent underline">
              {formatPhone(phone)}
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
            onlinePaymentReady(context.business, context.features, paymentGateway()),
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
