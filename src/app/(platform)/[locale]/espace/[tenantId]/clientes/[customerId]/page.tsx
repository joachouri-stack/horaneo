import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextField } from "@/components/admin/fields";
import { CustomerFields } from "@/components/manager/CustomerFields";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { getCustomer } from "@/modules/customers/customers";
import { loyaltyForManager } from "@/modules/loyalty/loyalty";
import { formatPhone } from "@/modules/phone";
import { adjustLoyaltyAction, saveCustomerAction, useLoyaltyRewardAction } from "../../actions";

/** Fiche cliente : contact, statistiques, notes, historique. */
export default async function CustomerPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/clientes/[customerId]">) {
  const page = await managerPage(params);
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
  const big =
    "inline-flex min-h-14 flex-1 items-center justify-center rounded-[var(--radius-card)] px-4 font-bold";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">{name}</h1>
        <p className="text-ink/70">
          {[customer.phone && formatPhone(customer.phone), customer.email].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex gap-2">
        {customer.phone && (
          <>
            <a href={`tel:${customer.phone}`} className={`${big} bg-navy text-white`}>
              {tManager("appointment.call")}
            </a>
            <a href={`sms:${customer.phone}`} className={`${big} border-2 border-navy/20 text-navy`}>
              {tManager("appointment.sms")}
            </a>
          </>
        )}
        {customer.email && (
          <a href={`mailto:${customer.email}`} className={`${big} border-2 border-navy/20 text-navy`}>
            {tManager("appointment.email")}
          </a>
        )}
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: t("visits"), value: String(stats.visits) },
          { label: t("noShows"), value: String(stats.noShows) },
          { label: t("spent"), value: page.fmt.money(stats.spentCents) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-card)] bg-white p-3 text-center shadow-sm">
            <dd className="font-display text-xl font-extrabold text-navy">{stat.value}</dd>
            <dt className="text-xs text-ink/70">{stat.label}</dt>
          </div>
        ))}
      </dl>
      {loyalty && (
        <section className={`${ui.card} space-y-4`} aria-labelledby="fidelite">
          <h2 id="fidelite" className="text-lg font-bold">
            {tLoyalty("card")}
          </h2>
          {loyalty.summary?.active && (
            <>
              <p className="font-display text-2xl font-extrabold text-navy">
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
              <p className="font-bold">
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
              <summary className="cursor-pointer font-semibold text-navy">{tLoyalty("adjust")}</summary>
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
                      <span className="block text-ink/60">{page.fmt.short(event.createdAt)}</span>
                    </span>
                    <span className="font-bold">{event.points > 0 ? `+${event.points}` : event.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <Link href={`${page.base}/rendez-vous/nouveau?cliente=${customer.id}`} className={ui.primaryButton}>
        + {t("book")}
      </Link>
      <section className={ui.card}>
        <h2 className="mb-4 text-lg font-bold">{t("contact")}</h2>
        <ActionForm action={saveCustomerAction} submitLabel={tCommon("save")}>
          <Hidden values={{ tenantId: page.tenantId, id: customer.id }} />
          <CustomerFields customer={customer} />
        </ActionForm>
      </section>
      <section aria-labelledby="historique" className="space-y-2">
        <h2 id="historique" className="text-lg font-bold">
          {t("history")}
        </h2>
        {history.length === 0 ? (
          <p className="text-ink/60">{t("noHistory")}</p>
        ) : (
          <ul className="divide-y divide-navy/10 rounded-[var(--radius-card)] bg-white shadow-sm">
            {history.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${page.base}/rendez-vous/${item.id}`}
                  className="flex justify-between gap-3 px-4 py-3 hover:bg-ivory"
                >
                  <span>
                    <span className="block font-semibold">{page.fmt.short(item.startsAt)}</span>
                    <span className="block text-sm text-ink/70">
                      {item.services.join(" + ")} · {item.staffName}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    <span className="block">{page.fmt.money(item.totalCents, item.currency)}</span>
                    <span className="block text-ink/60">{tManager(`status.${item.status}`)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
