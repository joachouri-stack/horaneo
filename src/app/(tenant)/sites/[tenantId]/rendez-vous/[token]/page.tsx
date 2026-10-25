import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { formatLongDate, formatTimeOf } from "@/components/booking/format";
import { ManageAppointment } from "@/components/booking/ManageAppointment";
import { PendingPayment } from "@/components/booking/PendingPayment";
import { PageTitle } from "@/components/site/blocks";
import { formatMoney } from "@/lib/format";
import { paymentGateway } from "@/lib/payments/stripe";
import { withTokenBusiness } from "@/lib/site/business";
import { getSite } from "@/lib/site/load";
import { canModify, findByManageToken } from "@/modules/booking/manage";
import { AppError } from "@/modules/errors";
import { depositCheckout, syncDeposit } from "@/modules/payments/deposits";
import { depositSummary } from "@/modules/payments/refunds";
import { formatPhone } from "@/modules/phone";
import { appointmentCalendarPath, SITE_PATHS } from "@/modules/site/paths";
import { appointmentEvent, googleCalendarUrl } from "@/lib/calendar/appointment";
import { tenantSiteUrl } from "@/lib/tenancy/urls";

// Lien personnel : jamais indexé, jamais transmis aux sites externes.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Page de gestion d'un rendez-vous, ouverte avec le lien reçu (sans compte). */
export default async function ManageAppointmentPage({
  params,
}: PageProps<"/sites/[tenantId]/rendez-vous/[token]">) {
  const { tenantId, token } = await params;
  const site = await getSite(tenantId);
  const t = await getTranslations("booking.manage");
  const gateway = paymentGateway();
  const { managed, deposit, checkout } = await withTokenBusiness(tenantId, token, async (tx) => {
    let managed = await findByManageToken(tx, tenantId, token, site.locale);
    if (!managed) return { managed: null, deposit: null, checkout: null };
    const id = managed.appointment.id;
    let checkout = null;
    if (managed.appointment.status === "pending_payment" || managed.appointment.status === "expired") {
      // Retour après le paiement (ou paiement non terminé) : l'état est relu chez Stripe.
      try {
        await syncDeposit(tx, tenantId, id, gateway);
        managed = (await findByManageToken(tx, tenantId, token, site.locale)) ?? managed;
        if (managed.appointment.status === "pending_payment")
          checkout = await depositCheckout(tx, tenantId, id, gateway);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
      }
    }
    return { managed, deposit: await depositSummary(tx, tenantId, id), checkout };
  });
  const phone = managed?.context.business.phone ?? site.tenant.phone;

  if (!managed) {
    return (
      <main id="contenu" className="mx-auto max-w-2xl px-4 py-12">
        <PageTitle title={t("title")} intro={t("notFound")} />
      </main>
    );
  }

  const { appointment, context } = managed;
  const timezone = context.tenant.timezone;
  const modifiable = canModify(managed, new Date());
  const serviceIds = managed.items.map((item) => item.serviceId).filter((id): id is string => Boolean(id));
  const staffOptions = context.staff
    .filter((member) => serviceIds.every((id) => member.serviceIds.includes(id)))
    .map((member) => ({ id: member.id, name: member.name }));
  const iso = appointment.startsAt.toISOString();
  const siteUrl = site.primaryHostname ? tenantSiteUrl(site.primaryHostname) : "";

  return (
    <main id="contenu" className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <PageTitle title={t("title")} />
      <section className="rounded-site bg-site-panel p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-site-muted">
          {t(`status.${appointment.status}`)}
        </p>
        <p className="mt-2 font-site-display text-2xl font-semibold text-site-heading">
          {t("when", {
            date: formatLongDate(iso, site.locale, timezone),
            time: formatTimeOf(iso, site.locale, timezone),
          })}
        </p>
        <p className="mt-1">{t("with", { name: managed.staffName })}</p>
        <h2 className="mt-4 font-semibold">{t("services")}</h2>
        <ul className="text-site-muted">
          {managed.items.map((item, index) => (
            <li key={index}>{item.name}</li>
          ))}
        </ul>
        {appointment.discountCents > 0 && (
          <p className="mt-2 text-site-muted">
            {t("discount")} : − {formatMoney(appointment.discountCents, appointment.currency, site.locale)}
          </p>
        )}
        <p className="mt-2 font-semibold">
          {t("total")} : {formatMoney(appointment.totalCents, appointment.currency, site.locale)}
          {appointment.depositCents > 0 &&
            deposit?.status !== "succeeded" &&
            ` · ${t("deposit")} : ${formatMoney(appointment.depositCents, appointment.currency, site.locale)}`}
        </p>
        {deposit?.status === "succeeded" && (
          <p className="mt-1">
            {deposit.refundedCents > 0
              ? t(deposit.refundPending ? "depositRefundPending" : "depositRefunded", {
                  amount: formatMoney(deposit.refundedCents, deposit.currency, site.locale),
                })
              : t("depositPaid", { amount: formatMoney(deposit.amountCents, deposit.currency, site.locale) })}
          </p>
        )}
        {modifiable && (
          <p className="mt-4 text-sm text-site-muted">
            {t("deadline", {
              date: formatLongDate(managed.deadline.toISOString(), site.locale, timezone),
              time: formatTimeOf(managed.deadline.toISOString(), site.locale, timezone),
            })}
          </p>
        )}
      </section>

      {/* Dans l'agenda du téléphone : la cliente ne l'oublie plus. */}
      {appointment.status === "confirmed" && appointment.endsAt > new Date() && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={appointmentCalendarPath(token)}
            className="inline-flex min-h-12 items-center justify-center rounded-site bg-site-button px-6 font-semibold text-site-on-button"
          >
            {t("addToCalendar")}
          </a>
          <a
            href={googleCalendarUrl(
              appointmentEvent({
                id: appointment.id,
                start: appointment.startsAt,
                end: appointment.endsAt,
                services: managed.items.map((item) => item.name),
                businessName: site.tenant.name,
                address: [
                  context.tenant.addressLine1,
                  [context.tenant.postalCode, context.tenant.city].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(", "),
                manageUrl: `${siteUrl}${SITE_PATHS.appointment}/${token}`,
                host: site.primaryHostname ?? "",
              }),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center font-semibold text-site-accent underline"
          >
            {t("googleCalendar")}
          </a>
        </div>
      )}

      {!modifiable && appointment.status === "confirmed" && (
        <p className="text-lg">
          {t("tooLate")}{" "}
          {phone && (
            <a href={`tel:${phone}`} className="font-semibold text-site-accent underline">
              {formatPhone(phone)}
            </a>
          )}
        </p>
      )}

      {checkout && (
        <PendingPayment
          token={token}
          checkout={checkout}
          amountCents={checkout.amountCents}
          currency={checkout.currency}
          locale={site.locale}
          holdExpiresAt={appointment.holdExpiresAt?.toISOString() ?? null}
          returnPath={`${SITE_PATHS.appointment}/${token}`}
        />
      )}

      <ManageAppointment
        token={token}
        refundableCents={deposit?.refundable ? deposit.amountCents - deposit.refundedCents : 0}
        currency={appointment.currency}
        locale={site.locale}
        timezone={timezone}
        canModify={modifiable}
        serviceIds={serviceIds}
        staffOptions={staffOptions}
        managePath={SITE_PATHS.appointment}
        bookingPath={SITE_PATHS.booking}
      />
    </main>
  );
}
