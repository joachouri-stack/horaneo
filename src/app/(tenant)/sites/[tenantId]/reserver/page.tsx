import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookingFlow } from "@/components/booking/BookingFlow";
import { PageTitle } from "@/components/site/blocks";
import { withTenant } from "@/db/access";
import { pickLocalized } from "@/i18n/locales";
import { paymentGateway } from "@/lib/payments/stripe";
import { SiteImage } from "@/components/site/SiteImage";
import { customerSession } from "@/lib/site/customer-session";
import { getSite } from "@/lib/site/load";
import { contactForBooking } from "@/modules/customer-space/space";
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
  // Seules les entreprises qui prennent des rendez-vous en ligne sont proposées.
  const open = site.businesses.filter((item) => item.bookingEnabled);
  if (open.length === 0) redirect(SITE_PATHS.home);
  const requestedService = site.services.find((service) => service.id === query.prestation);
  const business =
    open.length === 1
      ? open[0]
      : open.find((item) => item.id === (requestedService ? requestedService.businessId : query.avec));
  const multi = open.length > 1;
  if (!business) {
    // Nombre d'étapes affiché : « Avec qui ? », puis le parcours (avec l'acompte si l'une le demande).
    const contexts = await Promise.all(
      open.map((item) =>
        withTenant(tenantId, (tx) => loadBookingContext(tx, tenantId), undefined, item.id).catch(() => null),
      ),
    );
    const anyDeposit = contexts.some(
      (context) =>
        context?.settings.depositEnabled &&
        onlinePaymentReady(context.business, context.features, paymentGateway()),
    );
    const total = anyDeposit ? 5 : 4;
    return (
      <main id="contenu" className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="sr-only">{t("title")}</h1>
        <p className="text-sm text-site-muted">
          {t("stepOf", { current: 1, total, label: t("business.stepLabel") })}
        </p>
        <ol className="mt-6 flex gap-2" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <li
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i === 0 ? "bg-site-button" : "bg-site-border"}`}
            />
          ))}
        </ol>
        <form action={SITE_PATHS.booking} className="mt-6 space-y-4">
          <fieldset className="space-y-3">
            <legend className="mb-4 font-site-display text-3xl font-semibold text-site-heading">
              {t("business.title")}
            </legend>
            {open.map((item, index) => {
              const team = site.staff.filter((member) => member.businessId === item.id);
              const detail =
                item.role ||
                team
                  .map((member) => member.name)
                  .filter((name) => name !== item.name)
                  .join(", ");
              const photo = item.photo ?? team.find((member) => member.photo)?.photo;
              return (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-4 rounded-site border-2 border-site-border bg-site-card p-4 has-[:checked]:border-site-button has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
                >
                  <input
                    type="radio"
                    name="avec"
                    value={item.id}
                    required
                    defaultChecked={index === 0}
                    className="h-5 w-5 accent-[var(--site-button)]"
                  />
                  {photo && (
                    <SiteImage
                      image={photo}
                      alt=""
                      sizes="56px"
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  )}
                  <span>
                    <span className="block text-lg font-semibold">{item.name}</span>
                    {detail && <span className="block text-sm text-site-muted">{detail}</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <button
            type="submit"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button sm:w-auto"
          >
            {t("continue")}
          </button>
        </form>
      </main>
    );
  }

  // Cliente connectée à son espace : ses coordonnées sont déjà remplies.
  const session = site.features.customerSpace ? await customerSession(tenantId) : null;
  const { context, quotaReached, promoEnabled, prefill } = await withTenant(
    tenantId,
    async (tx) => {
      const context = await loadBookingContext(tx, tenantId);
      return {
        context,
        quotaReached: await isOnlineQuotaReached(tx, context),
        promoEnabled: Boolean(context.features.promoCodes) && (await hasActivePromoCodes(tx, tenantId)),
        prefill: session ? await contactForBooking(tx, tenantId, session) : null,
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
      <h1 className={multi ? "sr-only" : "mb-6 font-site-display text-4xl font-semibold text-site-heading"}>
        {t("title")}
      </h1>
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
          regularPriceCents: service.promotion ? service.promotion.referenceCents : null,
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
        preselectedStaffId={typeof query.membre === "string" ? query.membre : null}
        startAtSlot={Boolean(preselected) && query.reprise === "1"}
        prefill={prefill}
        initialGiftCode={typeof query.carte === "string" ? query.carte.slice(0, 40) : undefined}
        deposit={{
          // Acompte demandé seulement si le compte Stripe de l'établissement peut encaisser.
          enabled:
            context.settings.depositEnabled &&
            onlinePaymentReady(context.business, context.features, paymentGateway()),
          type: context.settings.depositType,
          value: context.settings.depositValue,
        }}
        promoEnabled={promoEnabled}
        giftCardsEnabled={Boolean(context.features.giftCards)}
        holdMinutes={context.settings.holdMinutes}
        cancellationHours={context.settings.cancellationDeadlineHours}
        privacyPath={SITE_PATHS.privacy}
        managePath={SITE_PATHS.appointment}
        stepOffset={multi ? 1 : 0}
        previousHref={multi ? SITE_PATHS.booking : undefined}
        payeeName={multi ? business.name : site.tenant.name}
        siteName={site.tenant.name}
        address={[site.tenant.address, [site.tenant.postalCode, site.tenant.city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ")}
      />
    </main>
  );
}
