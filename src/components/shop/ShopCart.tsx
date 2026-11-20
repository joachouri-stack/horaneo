"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { confirmOrderAction, type OrderOutcome } from "@/app/(tenant)/sites/[tenantId]/panier/actions";
import { CartView } from "./CartView";
import { CheckoutForm } from "./CheckoutForm";
import { SITE_PATHS } from "@/modules/site/paths";
import { clearCart } from "./cart-store";

/** Page Panier : le panier, puis les coordonnées et le paiement. */
export function ShopCart({
  locale,
  businessNames,
  returned,
}: {
  locale: string;
  /** Nom de chaque entreprise dont la boutique est ouverte (paiement « versé à … »). */
  businessNames: Record<string, string>;
  /** Retour après une validation bancaire hors de la page (3-D Secure). */
  returned: { orderId: string; businessId: string; failed: boolean } | null;
}) {
  // Validation refusée par la banque : le panier est gardé, la cliente peut payer à nouveau.
  if (returned?.failed) return <PaymentFailed />;
  if (returned) return <OrderReturn {...returned} />;
  return (
    <CartView
      locale={locale}
      checkout={(cart, view) => (
        <CheckoutForm
          cart={cart}
          view={view}
          locale={locale}
          businessName={businessNames[cart.businessId] ?? ""}
        />
      )}
    />
  );
}

function PaymentFailed() {
  const t = useTranslations("site.shop");
  return (
    <section role="alert" className="rounded-site bg-site-panel p-6 sm:p-8">
      <h2 className="font-site-display text-2xl font-semibold text-site-heading">
        {t("paymentFailedTitle")}
      </h2>
      <p className="mt-3 text-lg">{t("paymentFailed")}</p>
      <Link
        href={SITE_PATHS.cart}
        className="mt-6 inline-flex min-h-12 items-center rounded-site bg-site-button px-6 font-semibold text-site-on-button transition hover:opacity-90"
      >
        {t("backToCart")}
      </Link>
    </section>
  );
}

/** Après la validation bancaire : la commande est confirmée dès que Stripe confirme. */
function OrderReturn({ orderId, businessId }: { orderId: string; businessId: string }) {
  const t = useTranslations("site.shop");
  const [state, setState] = useState<OrderOutcome | null>(null);
  useEffect(() => {
    void confirmOrderAction(businessId, orderId)
      .catch(() => null)
      .then((result) => {
        if (result?.ok && result.data.status !== "pending_payment") clearCart();
        setState(
          result?.ok ? result.data : { status: "pending_payment", reference: "", fulfillment: "pickup" },
        );
      });
  }, [orderId, businessId]);
  if (!state) return <p aria-live="polite">{t("checking")}</p>;
  return (
    <section role="status" className="rounded-site bg-site-panel p-6 sm:p-8">
      <h2 className="font-site-display text-2xl font-semibold text-site-heading">{t("thanksTitle")}</h2>
      <p className="mt-3 text-lg">
        {state.status === "refunded"
          ? t("refunded")
          : state.status === "paid"
            ? t(state.fulfillment === "delivery" ? "thanksDelivery" : "thanksText", {
                reference: state.reference,
              })
            : t("thanksPending")}
      </p>
    </section>
  );
}
