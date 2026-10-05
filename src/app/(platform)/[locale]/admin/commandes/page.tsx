import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { pickLocalized } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { listPendingOrders } from "@/modules/orders/orders";
import { formatPhone } from "@/modules/phone";
import { rejectOrderAction } from "./actions";

/** Commandes du site commercial en attente de création du site. */
export default async function OrdersPage({ params }: PageProps<"/[locale]/admin/commandes">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, rows] = await Promise.all([
    getTranslations("admin.orders"),
    adminQuery((tx) => listPendingOrders(tx)),
  ]);
  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <p className="text-ink/80">{t("intro")}</p>
      {rows.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
      <ul className="space-y-4">
        {rows.map(({ order, planName, email, userName }) => (
          <li key={order.id} className={ui.card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-night">{order.businessName}</h2>
              <span className="font-semibold">
                {pickLocalized(planName, locale)} · {t(`status.${order.status as "paid"}`)}
              </span>
            </div>
            <p className="text-sm text-ink/60">
              {t("received", { date: formatDate(order.createdAt, locale) })}
            </p>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-ink/60">{t("activity")} : </dt>
                <dd className="inline">{order.activity}</dd>
              </div>
              <div>
                <dt className="inline text-ink/60">{t("phone")} : </dt>
                <dd className="inline">
                  <a href={`tel:${order.phone}`} className="underline">
                    {formatPhone(order.phone) || order.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="inline text-ink/60">{t("email")} : </dt>
                <dd className="inline">
                  <a href={`mailto:${email}`} className="underline">
                    {userName ? `${userName} · ` : ""}
                    {email}
                  </a>
                </dd>
              </div>
              {order.currentWebsite && (
                <div>
                  <dt className="inline text-ink/60">{t("website")} : </dt>
                  <dd className="inline">
                    <a
                      href={order.currentWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {order.currentWebsite}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-4 flex flex-wrap gap-3">
              {order.status === "in_creation" && order.tenantId ? (
                <Link href={`/admin/clients/${order.tenantId}`} className={`${ui.secondaryButton} sm:w-auto`}>
                  {t("openTenant")}
                </Link>
              ) : (
                <Link
                  href={{ pathname: "/admin/clients/nouveau", query: { commande: order.id } }}
                  className={`${ui.primaryButton} sm:w-auto`}
                >
                  {t("create")}
                </Link>
              )}
            </div>
            {order.status !== "in_creation" && (
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-coral-dark">{t("reject")}</summary>
                <ActionForm
                  action={rejectOrderAction}
                  submitLabel={t("reject")}
                  variant="secondary"
                  confirm={t("rejectConfirm")}
                  className="mt-3 space-y-3"
                >
                  <Hidden values={{ orderId: order.id }} />
                  <TextField id={`reason-${order.id}`} name="reason" label={t("reason")} />
                  {order.paidAt && <p className="text-sm text-ink/70">{t("refundHint")}</p>}
                </ActionForm>
              </details>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
