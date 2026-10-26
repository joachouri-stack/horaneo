import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
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
import { formatDuration } from "@/modules/site/format";
import { appointmentCalendarPath, SITE_PATHS } from "@/modules/site/paths";
import { appointmentEvent, googleCalendarUrl } from "@/lib/calendar/appointment";
import { tenantSiteUrl } from "@/lib/tenancy/urls";

// Lien personnel : jamais indexé, jamais transmis aux sites externes.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Page de gestion d'un rendez-vous, ouverte avec le lien reçu (sans compte). */
export default async function ManageAppointmentPage({
  params,
  searchParams,
}: PageProps<"/sites/[tenantId]/rendez-vous/[token]">) {
  const { tenantId, token } = await params;
  // Retour d'une annulation ou d'un déplacement fait sur cette page : message de réussite en haut.
  const { fait } = await searchParams;
  const site = await getSite(tenantId);
  const t = await getTranslations("booking.manage");
  const tBooking = await getTranslations("booking");
  const tServices = await getTranslations("site.services");
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

  const { appointment, context, movedTo } = managed;
  const timezone = context.tenant.timezone;
  const now = new Date();
  const modifiable = canModify(managed, now);
  const serviceIds = managed.items.map((item) => item.serviceId).filter((id): id is string => Boolean(id));
  const staffOptions = context.staff
    .filter((member) => serviceIds.every((id) => member.serviceIds.includes(id)))
    .map((member) => ({ id: member.id, name: member.name }));
  const iso = appointment.startsAt.toISOString();
  const siteUrl = site.primaryHostname ? tenantSiteUrl(site.primaryHostname) : "";
  const money = (cents: number) => formatMoney(cents, appointment.currency, site.locale);
  const date = (value: Date) => formatLongDate(value.toISOString(), site.locale, timezone);
  const time = (value: Date) => formatTimeOf(value.toISOString(), site.locale, timezone);
  const duration = (minutes: number) =>
    formatDuration((key, values) => tServices(key as "durationMinutes", values), minutes);
  const totalMinutes = managed.items.reduce((sum, item) => sum + item.durationMinutes, 0);
  // Déplacé par la cliente : l'ancien lien mène au nouveau rendez-vous.
  const moved = appointment.status === "cancelled" ? movedTo : null;
  const status = appointment.status;
  // Acompte réglé sans paiement par carte bancaire : il l'a été avec une carte cadeau.
  const giftCardDeposit =
    appointment.depositCents > 0 && !deposit && status !== "pending_payment" && status !== "expired";
  const depositPaid = deposit?.status === "succeeded" || giftCardDeposit;
  const rebook = (
    <Link
      href={SITE_PATHS.booking}
      className="inline-flex min-h-12 items-center justify-center rounded-site bg-site-button px-6 font-semibold text-site-on-button"
    >
      {t("rebook")}
    </Link>
  );
  const banner = "space-y-4 rounded-site border-2 border-site-button bg-site-panel p-6";

  return (
    <main id="contenu" className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <PageTitle title={t("title")} />

      {moved && (
        <section role="status" className={banner}>
          <p className="text-lg font-semibold">
            {fait === "deplace"
              ? t("rescheduled")
              : t("movedTo", { date: date(moved.startsAt), time: time(moved.startsAt) })}
          </p>
          {moved.status === "cancelled" && <p>{t("movedThenCancelled")}</p>}
          <Link
            href={`${SITE_PATHS.appointment}/${moved.manageToken}`}
            className="inline-flex min-h-12 items-center justify-center rounded-site bg-site-button px-6 py-3 text-center font-semibold text-site-on-button"
          >
            {t("seeNew", { date: date(moved.startsAt), time: time(moved.startsAt) })}
          </Link>
        </section>
      )}
      {!moved && status === "cancelled" && (
        <section role="status" className={banner}>
          <p className="text-lg font-semibold">{fait === "annule" ? t("cancelled") : t("cancelledText")}</p>
          {fait === "annule" && deposit && deposit.refundedCents > 0 && (
            <p>{t("refunded", { amount: money(deposit.refundedCents) })}</p>
          )}
          {fait === "annule" && giftCardDeposit && <p>{t("creditedBack")}</p>}
          {rebook}
        </section>
      )}
      {status === "expired" && (
        <section role="status" className={banner}>
          <p className="text-lg font-semibold">{t("expiredText")}</p>
          {rebook}
        </section>
      )}

      <section className={`rounded-site bg-site-panel p-6 ${moved ? "opacity-70" : ""}`}>
        <p className="text-sm font-semibold uppercase tracking-wide text-site-muted">
          {moved ? t("status.moved") : t(`status.${status}`)}
        </p>
        <p className="mt-2 font-site-display text-2xl font-semibold text-site-heading">
          {t("when", { date: date(appointment.startsAt), time: time(appointment.startsAt) })}
        </p>
        <p className="mt-1">{t("with", { name: managed.staffName })}</p>
        <h2 className="mt-4 font-semibold">{t("services")}</h2>
        <ul className="text-site-muted">
          {managed.items.map((item, index) => (
            <li key={index}>
              {tBooking("serviceDuration", { name: item.name, duration: duration(item.durationMinutes) })}
            </li>
          ))}
        </ul>
        <p className="text-site-muted">
          {tBooking("details.totalDuration", {
            duration: duration(totalMinutes),
            time: time(appointment.endsAt),
          })}
        </p>
        {appointment.discountCents > 0 && (
          <p className="mt-2 text-site-muted">
            {t("discount", { amount: money(appointment.discountCents) })}
          </p>
        )}
        <p className="mt-2 font-semibold">
          {t("total", { amount: money(appointment.totalCents) })}
          {appointment.depositCents > 0 &&
            !depositPaid &&
            ` · ${t("deposit", { amount: money(appointment.depositCents) })}`}
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
        {status === "confirmed" && depositPaid && (
          <p className="mt-1 text-site-muted">
            {tBooking("details.remaining", {
              amount: money(Math.max(0, appointment.totalCents - appointment.depositCents)),
            })}
          </p>
        )}
        {modifiable && (
          <p className="mt-4 text-sm text-site-muted">
            {context.settings.cancellationDeadlineHours === 0
              ? tBooking("details.freeUntilStart")
              : t("deadline", { date: date(managed.deadline), time: time(managed.deadline) })}
          </p>
        )}
      </section>

      {/* Dans l'agenda du téléphone : la cliente ne l'oublie plus. */}
      {status === "confirmed" && appointment.endsAt > now && (
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
            className="inline-flex min-h-11 items-center justify-center text-center font-semibold text-site-accent underline"
          >
            {t("googleCalendar")}
          </a>
        </div>
      )}

      {/* Délai dépassé (rendez-vous encore à venir) : on appelle l'établissement. */}
      {!modifiable && status === "confirmed" && appointment.startsAt > now && (
        <div className="space-y-3">
          <p className="text-lg">{t("tooLate")}</p>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex min-h-12 items-center justify-center rounded-site border border-site-border px-6 font-semibold text-site-text"
            >
              {t("callPhone", { phone: formatPhone(phone) })}
            </a>
          )}
        </div>
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
          restartHref={SITE_PATHS.booking}
        />
      )}

      <ManageAppointment
        token={token}
        startsAt={iso}
        refundableCents={deposit?.refundable ? deposit.amountCents - deposit.refundedCents : 0}
        giftCardDeposit={giftCardDeposit}
        currency={appointment.currency}
        locale={site.locale}
        timezone={timezone}
        canModify={modifiable}
        serviceIds={serviceIds}
        staffOptions={staffOptions}
        managePath={SITE_PATHS.appointment}
      />
    </main>
  );
}
