import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { managerPage } from "@/lib/manager/page";
import { firstPlanWith } from "@/modules/billing/plans";
import { formatPhone } from "@/modules/phone";
import { listShopOrders, orderReference } from "@/modules/shop/orders";
import { shopOrderAction } from "../../actions";

/** Couleur de l'étiquette de chaque état. */
const TONES: Record<string, string> = {
  paid: "bg-[#fdf1e0] text-[#8a5212]",
  ready: "bg-[#e8ebfa] text-[#2b3990]",
  collected: "bg-[#e3f4ee] text-[#1f7a5f]",
  refunded: "bg-mist-50 text-ink-soft",
  cancelled: "bg-mist-50 text-ink-soft",
};

/** Commandes de la boutique : à préparer, prêtes (ou expédiées), retirées (ou livrées). */
export default async function ShopOrdersPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/commandes">) {
  const page = await managerPage(params, "shop");
  const t = await getTranslations("manager.orders");
  const available = Boolean(page.tenant.features.commerce);
  const orders = available ? await page.db((tx) => listShopOrders(tx, page.tenantId)) : [];
  const open = orders.filter((order) => order.status === "paid" || order.status === "ready");
  const done = orders.filter((order) => order.status !== "paid" && order.status !== "ready");

  const card = (order: (typeof orders)[number]) => {
    const mode = order.fulfillment;
    return (
      <li key={order.id} className={ui.card}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-night">
              {order.customerName} · <span className="tabular-nums">{orderReference(order.id)}</span>
            </p>
            <p className="text-sm text-ink/70">
              {page.fmt.day(order.paidAt ?? order.createdAt)} ·{" "}
              {page.fmt.time(order.paidAt ?? order.createdAt)} ·{" "}
              {page.fmt.money(order.totalCents, order.currency)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${TONES[order.status] ?? ""}`}>
            {t(`status.${order.status as "paid"}`, { mode })}
          </span>
        </div>
        <ul className="mt-3 space-y-1">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
              </span>
              <span className="tabular-nums text-ink/70">
                {page.fmt.money(item.unitPriceCents * item.quantity, order.currency)}
              </span>
            </li>
          ))}
          {mode === "delivery" && (
            <li className="flex justify-between gap-3 text-ink/70">
              <span>{t("deliveryFee")}</span>
              <span className="tabular-nums">
                {order.deliveryFeeCents === 0
                  ? t("free")
                  : page.fmt.money(order.deliveryFeeCents, order.currency)}
              </span>
            </li>
          )}
        </ul>
        <p className="mt-3 text-sm font-medium text-night">
          {mode === "delivery" ? (
            <>
              {t("deliverTo")}{" "}
              <span className="font-normal">
                {[
                  order.deliveryAddressLine1,
                  order.deliveryAddressLine2,
                  [order.deliveryPostalCode, order.deliveryCity].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </>
          ) : (
            t("pickup")
          )}
        </p>
        <p className="mt-2 text-sm text-ink/80">
          <a
            href={`mailto:${order.customerEmail}`}
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {order.customerEmail}
          </a>
          {order.customerPhone && (
            <>
              {" · "}
              <a
                href={`tel:${order.customerPhone}`}
                className="inline-flex min-h-11 items-center underline underline-offset-4"
              >
                {formatPhone(order.customerPhone, page.tenant.country)}
              </a>
            </>
          )}
        </p>
        {order.note && <p className="mt-2 rounded-lg bg-mist-50 p-3 text-sm">« {order.note} »</p>}
        {(order.status === "paid" || order.status === "ready") && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {order.status === "paid" && (
              <ActionForm
                action={shopOrderAction}
                submitLabel={t("markReady", { mode })}
                className="w-full sm:w-auto"
              >
                <Hidden values={{ tenantId: page.tenantId, id: order.id, operation: "ready" }} />
              </ActionForm>
            )}
            <ActionForm
              action={shopOrderAction}
              submitLabel={t("markCollected", { mode })}
              variant={order.status === "ready" ? "primary" : "secondary"}
              className="w-full sm:w-auto"
            >
              <Hidden values={{ tenantId: page.tenantId, id: order.id, operation: "collected" }} />
            </ActionForm>
            <ActionForm
              action={shopOrderAction}
              submitLabel={t("cancel")}
              variant="link"
              confirm={t("cancelConfirm", { amount: page.fmt.money(order.totalCents, order.currency) })}
            >
              <Hidden values={{ tenantId: page.tenantId, id: order.id, operation: "cancel" }} />
            </ActionForm>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      {!available ? (
        <p className={ui.card}>
          {t("unavailable", {
            plan: (await page.db((tx) => firstPlanWith(tx, "commerce", page.locale))) ?? "none",
          })}
        </p>
      ) : (
        <>
          <p className="text-ink/80">{t("intro")}</p>
          <section aria-labelledby="commandes-a-traiter" className="space-y-3">
            <h2 id="commandes-a-traiter" className="text-lg font-semibold text-night">
              {t("open", { count: open.length })}
            </h2>
            {open.length === 0 ? (
              <p className="text-ink/70">{t("noneOpen")}</p>
            ) : (
              <ul className="space-y-3">{open.map(card)}</ul>
            )}
          </section>
          {done.length > 0 && (
            <details className="space-y-3">
              <summary className="cursor-pointer text-lg font-semibold text-night">
                {t("done", { count: done.length })}
              </summary>
              <ul className="mt-3 space-y-3">{done.map(card)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
