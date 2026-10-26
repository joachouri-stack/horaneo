import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { getAppointmentDetail } from "@/modules/agenda/queries";
import { loadBookingContext } from "@/modules/booking/availability";
import { utcToLocal } from "@/modules/booking/time";
import { customerMessagesOf } from "@/modules/messages/queue";
import { depositSummary } from "@/modules/payments/refunds";
import { formatPhone } from "@/modules/phone";
import {
  cancelAppointmentAction,
  moveAppointmentAction,
  setAttendanceAction,
  updateNoteAction,
} from "../../actions";

/** Un rendez-vous : contacter la cliente, venue/absente, déplacer, annuler. */
/** Couleur de l'étiquette de statut en haut de la fiche. */
const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-navy/10 text-night",
  pending_payment: "bg-[#fdf3e2] text-[#a8661b]",
  attended: "bg-success/15 text-[#1e6b48]",
  no_show: "bg-ink/10 text-ink/80",
  cancelled: "bg-[#fdecea] text-[#b4372a]",
};

export default async function AppointmentPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/rendez-vous/[appointmentId]">) {
  const page = await managerPage(params);
  const { appointmentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) notFound();
  const [t, tCommon] = await Promise.all([getTranslations("manager"), getTranslations("common")]);
  const { item, staff, deposit, messages } = await page.db(async (tx) => ({
    messages: await customerMessagesOf(tx, page.tenantId, appointmentId),
    item: await getAppointmentDetail(tx, page.tenantId, appointmentId, page.locale),
    staff: (await loadBookingContext(tx, page.tenantId)).staff,
    deposit: await depositSummary(tx, page.tenantId, appointmentId),
  }));
  if (!item) notFound();
  const local = utcToLocal(item.startsAt, page.tenant.timezone);
  const active = item.status === "confirmed" || item.status === "pending_payment";
  const hidden = { tenantId: page.tenantId, id: item.id };
  const big =
    "inline-flex min-h-14 flex-1 items-center justify-center rounded-[var(--radius-card)] px-4 font-semibold";

  return (
    <div className="space-y-6">
      <div>
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink/60">
          {/* Statut bien visible : un rendez-vous annulé ne doit pas passer inaperçu. */}
          <span className={`rounded-full px-3 py-1 ${STATUS_BADGE[item.status] ?? "bg-navy/10 text-night"}`}>
            {t(`status.${item.status}`)}
          </span>
          <span className="uppercase">{t(`source.${item.source}`)}</span>
        </p>
        <h1 className="mt-1 font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night first-letter:uppercase">
          {t("appointment.when", {
            date: page.fmt.day(item.startsAt),
            time: page.fmt.time(item.startsAt),
            end: page.fmt.time(item.endsAt),
          })}
        </h1>
        <p className="text-ink/80">{t("appointment.with", { name: item.staffName })}</p>
      </div>

      <section className={ui.card}>
        <h2 className="text-sm font-semibold uppercase text-ink/60">{t("appointment.customer")}</h2>
        <p className="mt-1 text-xl font-semibold text-night">
          <Link href={`${page.base}/clientes/${item.customerId}`} className="underline">
            {item.customerName}
          </Link>
        </p>
        <div className="mt-4 flex gap-2">
          {item.customerPhone && (
            <>
              <a
                href={`tel:${item.customerPhone}`}
                className={`${big} bg-navy text-white`}
                aria-label={`${t("appointment.call")} ${formatPhone(item.customerPhone)}`}
              >
                {t("appointment.call")}
              </a>
              <a href={`sms:${item.customerPhone}`} className={`${big} border-2 border-navy/20 text-night`}>
                {t("appointment.sms")}
              </a>
            </>
          )}
          {item.customerEmail && (
            <a href={`mailto:${item.customerEmail}`} className={`${big} border-2 border-navy/20 text-night`}>
              {t("appointment.email")}
            </a>
          )}
        </div>
        {item.customerPhone && <p className="mt-2 text-sm text-ink/60">{formatPhone(item.customerPhone)}</p>}
      </section>

      <section className={ui.card}>
        <h2 className="text-sm font-semibold uppercase text-ink/60">{t("appointment.services")}</h2>
        <ul className="mt-1">
          {item.services.map((name, index) => (
            <li key={index} className="font-semibold">
              {name}
            </li>
          ))}
        </ul>
        {item.discountCents > 0 && (
          <p className="mt-2 text-ink/70">
            {t("appointment.discount", { amount: page.fmt.money(item.discountCents, item.currency) })}
          </p>
        )}
        <p className="mt-2">
          {t("appointment.total")} : <strong>{page.fmt.money(item.totalCents, item.currency)}</strong>
        </p>
        {deposit && (
          <p className="mt-1">
            {deposit.status === "succeeded"
              ? t("appointment.depositPaid", {
                  amount: page.fmt.money(deposit.amountCents, deposit.currency),
                })
              : t("appointment.depositWaiting", {
                  amount: page.fmt.money(deposit.amountCents, deposit.currency),
                })}
            {deposit.refundedCents > 0 &&
              ` · ${t(
                deposit.refundPending ? "appointment.depositRefundPending" : "appointment.depositRefunded",
                {
                  amount: page.fmt.money(deposit.refundedCents, deposit.currency),
                },
              )}`}
          </p>
        )}
        {item.customerNote && (
          <p className="mt-3 rounded bg-mist-50 p-3">
            <span className="block text-sm font-semibold text-ink/60">{t("appointment.customerNote")}</span>
            {item.customerNote}
          </p>
        )}
      </section>

      {/* Venue / absente : seulement une fois le rendez-vous commencé (un point de fidélité en dépend). */}
      {["confirmed", "attended", "no_show"].includes(item.status) && item.startsAt <= new Date() && (
        <div className="flex gap-3">
          {item.status !== "attended" && (
            <ActionForm
              action={setAttendanceAction}
              submitLabel={`✓ ${t("appointment.attended")}`}
              className="flex-1 [&>button]:w-full"
            >
              <Hidden values={{ ...hidden, status: "attended" }} />
            </ActionForm>
          )}
          {item.status !== "no_show" && (
            <ActionForm
              action={setAttendanceAction}
              submitLabel={t("appointment.noShow")}
              confirm={t("appointment.noShowConfirm")}
              variant="secondary"
              className="flex-1 [&>button]:w-full"
            >
              <Hidden values={{ ...hidden, status: "no_show" }} />
            </ActionForm>
          )}
          {(item.status === "attended" || item.status === "no_show") && (
            <ActionForm
              action={setAttendanceAction}
              submitLabel={t("appointment.undo")}
              variant="link"
              className="flex-1"
            >
              <Hidden values={{ ...hidden, status: "confirmed" }} />
            </ActionForm>
          )}
        </div>
      )}

      <section className={ui.card}>
        <ActionForm action={updateNoteAction} submitLabel={tCommon("save")} variant="secondary">
          <Hidden values={hidden} />
          <TextArea
            name="internalNote"
            label={t("appointment.internalNote")}
            defaultValue={item.internalNote}
            rows={2}
          />
        </ActionForm>
      </section>

      {messages.length > 0 && (
        <section className={ui.card}>
          <h2 className="text-sm font-semibold uppercase text-ink/60">{t("appointment.messages")}</h2>
          <ul className="mt-2 divide-y divide-navy/10">
            {messages.map((message) => (
              <li key={message.id} className="flex flex-wrap justify-between gap-x-3 py-2">
                <span>
                  {t(
                    `appointment.messageTemplate.${message.template.replace(".", "_")}` as "appointment.messages",
                  )}
                </span>
                <span className="text-ink/70">
                  {t(`appointment.messageStatus.${message.status}`)}
                  {message.sentAt && ` · ${page.fmt.short(message.sentAt)} ${page.fmt.time(message.sentAt)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item.status === "confirmed" && (
        <details className={ui.card}>
          {/* Toute la carte se touche pour l'ouvrir. */}
          <summary className="-m-5 flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-5 text-lg font-semibold sm:-m-6 sm:p-6 [&::-webkit-details-marker]:hidden text-night">
            {t("appointment.move")}
            <span aria-hidden="true" className="text-ink-soft">
              ▾
            </span>
          </summary>
          <ActionForm
            action={moveAppointmentAction}
            submitLabel={t("appointment.move")}
            className="mt-8 space-y-4"
          >
            <Hidden values={hidden} />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                name="date"
                type="date"
                label={t("appointment.date")}
                defaultValue={local.date}
                required
              />
              <TextField
                name="time"
                type="time"
                label={t("appointment.time")}
                defaultValue={local.time}
                required
              />
            </div>
            <SelectField
              name="staffId"
              label={t("appointment.staff")}
              defaultValue={item.staffId}
              // La personne du rendez-vous reste proposée même désactivée : sans elle, le
              // rendez-vous passerait sans le dire à la première personne de la liste.
              options={[
                ...(staff.some((member) => member.id === item.staffId)
                  ? []
                  : [{ value: item.staffId, label: item.staffName }]),
                ...staff.map((member) => ({ value: member.id, label: member.name })),
              ]}
            />
          </ActionForm>
        </details>
      )}

      {active && (
        <details className={ui.card}>
          <summary className="-m-5 flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-5 text-lg font-semibold sm:-m-6 sm:p-6 [&::-webkit-details-marker]:hidden text-[#b4372a]">
            {t("appointment.cancel")}
            <span aria-hidden="true" className="text-ink-soft">
              ▾
            </span>
          </summary>
          <ActionForm
            action={cancelAppointmentAction}
            submitLabel={t("appointment.cancel")}
            variant="secondary"
            confirm={t("appointment.cancelConfirm")}
            className="mt-8 space-y-4"
          >
            <Hidden values={hidden} />
            <TextField name="reason" label={t("appointment.cancelReason")} />
            {deposit?.refundable && (
              <div>
                <CheckboxField
                  name="refund"
                  label={t("appointment.refund", {
                    amount: page.fmt.money(deposit.amountCents - deposit.refundedCents, deposit.currency),
                  })}
                />
                <p className="text-sm text-ink/70">{t("appointment.refundHint")}</p>
              </div>
            )}
          </ActionForm>
        </details>
      )}
    </div>
  );
}
