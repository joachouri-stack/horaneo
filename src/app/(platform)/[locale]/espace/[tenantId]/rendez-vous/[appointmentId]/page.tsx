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
    "inline-flex min-h-14 flex-1 items-center justify-center rounded-[var(--radius-card)] px-4 font-bold";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase text-ink/60">
          {t(`status.${item.status}`)} · {t(`source.${item.source}`)}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold first-letter:uppercase">
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
        <p className="mt-1 text-xl font-bold text-navy">
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
              <a href={`sms:${item.customerPhone}`} className={`${big} border-2 border-navy/20 text-navy`}>
                {t("appointment.sms")}
              </a>
            </>
          )}
          {item.customerEmail && (
            <a href={`mailto:${item.customerEmail}`} className={`${big} border-2 border-navy/20 text-navy`}>
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
          <p className="mt-3 rounded bg-ivory p-3">
            <span className="block text-sm font-semibold text-ink/60">{t("appointment.customerNote")}</span>
            {item.customerNote}
          </p>
        )}
      </section>

      {item.status !== "cancelled" && item.status !== "expired" && (
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
          <summary className="cursor-pointer text-lg font-bold text-navy">{t("appointment.move")}</summary>
          <ActionForm
            action={moveAppointmentAction}
            submitLabel={t("appointment.move")}
            className="mt-4 space-y-4"
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
              options={staff.map((member) => ({ value: member.id, label: member.name }))}
            />
          </ActionForm>
        </details>
      )}

      {active && (
        <details className={ui.card}>
          <summary className="cursor-pointer text-lg font-bold text-coral-dark">
            {t("appointment.cancel")}
          </summary>
          <ActionForm
            action={cancelAppointmentAction}
            submitLabel={t("appointment.cancel")}
            variant="secondary"
            confirm={t("appointment.cancelConfirm")}
            className="mt-4 space-y-4"
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
