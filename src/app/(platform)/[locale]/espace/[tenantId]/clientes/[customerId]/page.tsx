import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextField } from "@/components/admin/fields";
import { CustomerFields } from "@/components/manager/CustomerFields";
import { DASH_ICONS, DashIcon, panel } from "@/components/manager/DashboardWidgets";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { formatBirthday } from "@/modules/customers/birthday";
import { getCustomer } from "@/modules/customers/customers";
import { loyaltyForManager } from "@/modules/loyalty/loyalty";
import { formatPhone } from "@/modules/phone";
import { canAccess } from "@/modules/team/access";
import {
  adjustLoyaltyAction,
  deleteCustomerAction,
  saveCustomerAction,
  useLoyaltyRewardAction,
} from "../../actions";

/** Pictogrammes des coordonnées (traits, même style que le reste de l'espace). */
const ICON = {
  phone:
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  cake: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01",
} as const;

function Icon({ d }: { d: string }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mist-50 text-ink-soft">
      <DashIcon d={d} className="h-[18px] w-[18px]" />
    </span>
  );
}

/** Couleur de l'état d'un rendez-vous dans l'historique. */
const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-accent-soft text-accent-strong",
  pending_payment: "bg-[#fdf3e2] text-[#8a5212]",
  attended: "bg-success/15 text-success",
  no_show: "bg-[#fdecea] text-[#b4372a]",
  cancelled: "bg-mist-50 text-ink/70",
};

/** Fiche client : identité et contact, chiffres, historique, fidélité, modification et suppression. */
export default async function CustomerPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/clientes/[customerId]">) {
  const page = await managerPage(params, "customers");
  const { customerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) notFound();
  const [t, tManager, tCommon] = await Promise.all([
    getTranslations("manager.customers"),
    getTranslations("manager"),
    getTranslations("common"),
  ]);
  const card = await page.db((tx) => getCustomer(tx, page.tenantId, customerId, page.locale));
  if (!card) notFound();
  const loyalty = await page.db((tx) => loyaltyForManager(tx, page.tenantId, customerId));
  const tLoyalty = await getTranslations("manager.loyalty");
  const { customer, history, stats } = card;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ");
  const tz = page.tenant.timezone;
  const dayOf = new Intl.DateTimeFormat(page.locale, { day: "numeric", timeZone: tz });
  const monthOf = new Intl.DateTimeFormat(page.locale, { month: "short", timeZone: tz });
  const initials = (customer.firstName.charAt(0) + (customer.lastName?.charAt(0) ?? "")).toUpperCase();
  // Suppression : la gérante seulement, et pas une fiche déjà effacée.
  const isOwner = canAccess(page.space, "owner") && !customer.anonymizedAt;
  const action =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[0.95rem] font-semibold transition";
  const contactRow = "flex min-h-11 items-center gap-3 text-[0.95rem] text-night";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      {/* Carte du client : identité, contact, actions rapides, chiffres. */}
      <section aria-labelledby="client" className={`${panel} space-y-5 lg:sticky lg:top-6`}>
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-violet),var(--color-azure-dark))] font-display text-lg font-semibold text-white"
          >
            {initials}
          </span>
          <h1
            id="client"
            className="min-w-0 font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.025em] text-night"
          >
            {name}
          </h1>
        </div>
        <ul className="space-y-0.5">
          {customer.phone && (
            <li>
              <a href={`tel:${customer.phone}`} className={`${contactRow} hover:text-accent`}>
                <Icon d={ICON.phone} />
                {formatPhone(customer.phone)}
              </a>
            </li>
          )}
          {customer.email && (
            <li>
              <a href={`mailto:${customer.email}`} className={`${contactRow} min-w-0 hover:text-accent`}>
                <Icon d={ICON.mail} />
                <span className="truncate">{customer.email}</span>
              </a>
            </li>
          )}
          <li className={`${contactRow} text-ink/70`}>
            <Icon d={ICON.cake} />
            {customer.birthMonth && customer.birthDay
              ? t("birthdayOn", { date: formatBirthday(customer.birthMonth, customer.birthDay, page.locale) })
              : t("birthdayUnknown")}
          </li>
        </ul>
        <div className="flex gap-2">
          {customer.phone && (
            <>
              <a href={`tel:${customer.phone}`} className={`${action} bg-night text-white hover:bg-navy`}>
                {tManager("appointment.call")}
              </a>
              <a
                href={`sms:${customer.phone}`}
                className={`${action} border border-hairline bg-white text-night hover:border-accent-line hover:text-accent`}
              >
                {tManager("appointment.sms")}
              </a>
            </>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className={`${action} border border-hairline bg-white text-night hover:border-accent-line hover:text-accent`}
            >
              {tManager("appointment.email")}
            </a>
          )}
        </div>
        <dl className="grid grid-cols-3 divide-x divide-hairline rounded-2xl bg-mist-50 py-3">
          {[
            { label: t("visits"), value: String(stats.visits) },
            { label: t("noShows"), value: String(stats.noShows) },
            { label: t("spent"), value: page.fmt.money(stats.spentCents) },
          ].map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col-reverse items-center px-1 text-center">
              <dt className="text-[0.8125rem] text-ink/70">{stat.label}</dt>
              <dd className="font-display text-lg font-semibold whitespace-nowrap text-night tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        <Link
          href={`${page.base}/rendez-vous/nouveau?cliente=${customer.id}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 font-semibold text-white transition hover:bg-accent-strong"
        >
          <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
          {t("book")}
        </Link>
      </section>

      <div className="min-w-0 space-y-6">
        {customer.notes && (
          <section aria-labelledby="notes" className={panel}>
            <h2 id="notes" className="mb-2 font-display text-[1.1rem] font-semibold text-night">
              {t("notes")}
            </h2>
            <p className="whitespace-pre-line text-ink/80">{customer.notes}</p>
          </section>
        )}

        <section aria-labelledby="historique" className={panel}>
          <h2 id="historique" className="mb-3 font-display text-[1.1rem] font-semibold text-night">
            {t("history")}
          </h2>
          {history.length === 0 ? (
            <p className="text-ink/70">{t("noHistory")}</p>
          ) : (
            <ul className="-mx-2 divide-y divide-hairline">
              {history.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${page.base}/rendez-vous/${item.id}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-mist-50"
                  >
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-accent-soft py-1.5 text-accent-strong">
                      <span className="font-display text-lg font-semibold leading-none">
                        {dayOf.format(item.startsAt)}
                      </span>
                      <span className="text-[0.75rem] uppercase">
                        {monthOf.format(item.startsAt).replace(".", "")}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-night">
                        {item.services.join(" + ")}
                      </span>
                      <span className="block text-sm text-ink/70">
                        {page.fmt.time(item.startsAt)} · {item.staffName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium text-night tabular-nums">
                        {page.fmt.money(item.totalCents, item.currency)}
                      </span>
                      <span
                        className={`mt-0.5 inline-block rounded-full px-2 py-px text-[0.75rem] font-medium ${STATUS_TONE[item.status] ?? STATUS_TONE.cancelled}`}
                      >
                        {tManager(`status.${item.status}`)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {loyalty?.config.included && (
          <section className={`${ui.card} space-y-4`} aria-labelledby="fidelite">
            <h2 id="fidelite" className="text-lg font-semibold">
              {tLoyalty("card")}
            </h2>
            {loyalty.summary?.active && (
              <>
                <p className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
                  {tLoyalty("progress", {
                    points: loyalty.summary.points,
                    required: loyalty.summary.visitsRequired,
                  })}
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-navy/10">
                  <div
                    className="h-full rounded-full bg-navy"
                    style={{
                      width: `${Math.min(100, (loyalty.summary.points / loyalty.summary.visitsRequired) * 100)}%`,
                    }}
                  />
                </div>
              </>
            )}
            {loyalty.summary?.reward && (
              <div className="space-y-2 rounded-[var(--radius-card)] border-2 border-dashed border-navy/30 p-4">
                <p className="font-semibold">
                  {tLoyalty("reward", {
                    label:
                      loyalty.summary.reward.label || page.fmt.money(loyalty.summary.reward.amountCents ?? 0),
                  })}
                </p>
                <p className="text-sm text-ink/70">
                  {tLoyalty("rewardValid", { date: page.fmt.short(loyalty.summary.reward.expiresAt) })}
                </p>
                <ActionForm
                  action={useLoyaltyRewardAction}
                  submitLabel={tLoyalty("useReward")}
                  confirm={tLoyalty("useRewardConfirm")}
                >
                  <Hidden values={{ tenantId: page.tenantId, rewardId: loyalty.summary.reward.id }} />
                </ActionForm>
              </div>
            )}
            {!loyalty.summary?.active && (
              <p className="text-ink/70">
                {loyalty.config.included ? tLoyalty("inactive") : tLoyalty("notIncluded")}
              </p>
            )}
            {loyalty.config.included && (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-night">
                  {tLoyalty("adjust")}
                </summary>
                <ActionForm
                  action={adjustLoyaltyAction}
                  submitLabel={tLoyalty("adjustSubmit")}
                  resetOnSuccess
                  className="mt-3 space-y-3"
                >
                  <Hidden values={{ tenantId: page.tenantId, customerId: customer.id }} />
                  <TextField name="points" type="number" label={tLoyalty("adjustPoints")} required />
                  <TextField name="reason" label={tLoyalty("adjustReason")} required />
                </ActionForm>
              </details>
            )}
            {loyalty.history.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold">{tLoyalty("history")}</h3>
                <ul className="divide-y divide-navy/10 text-sm">
                  {loyalty.history.map((event) => (
                    <li key={event.id} className="flex justify-between gap-3 py-2">
                      <span>
                        {tLoyalty(`kinds.${event.kind}`)}
                        {event.reason && event.reason !== "expired" && ` — ${event.reason}`}
                        <span className="block text-ink/70">{page.fmt.short(event.createdAt)}</span>
                      </span>
                      <span className="font-semibold">
                        {event.points > 0 ? `+${event.points}` : event.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Modifier la fiche : repliée, ouverte à la demande. */}
        <details className={`${panel} group`}>
          <summary className="-m-5 flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-5 font-display text-[1.1rem] font-semibold text-night sm:-m-6 sm:p-6 [&::-webkit-details-marker]:hidden">
            {t("edit")}
            <span aria-hidden="true" className="text-ink-soft transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="mt-8">
            <ActionForm action={saveCustomerAction} submitLabel={tCommon("save")}>
              <Hidden values={{ tenantId: page.tenantId, id: customer.id }} />
              <CustomerFields customer={customer} />
            </ActionForm>
          </div>
        </details>

        {/* Suppression : réservée à la gérante, avec confirmation. */}
        {isOwner && (
          <section
            aria-labelledby="supprimer"
            className="rounded-[1.4rem] border border-[#f1c5bf] bg-white p-5 sm:p-6"
          >
            <h2 id="supprimer" className="font-display text-[1.1rem] font-semibold text-night">
              {t("delete")}
            </h2>
            <p className="mb-4 mt-1 text-sm text-ink/70">{t("deleteHint")}</p>
            <ActionForm
              action={deleteCustomerAction}
              submitLabel={t("delete")}
              confirm={t("deleteConfirm", { name })}
              variant="dangerOutline"
            >
              <Hidden values={{ tenantId: page.tenantId, id: customer.id }} />
            </ActionForm>
          </section>
        )}
      </div>
    </div>
  );
}
