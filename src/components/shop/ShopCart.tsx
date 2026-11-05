"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { confirmOrderAction, type OrderOutcome } from "@/app/(tenant)/sites/[tenantId]/panier/actions";
import { CartView } from "./CartView";
import { CheckoutForm } from "./CheckoutForm";
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
  returned: { orderId: string; businessId: string } | null;
}) {
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

/** Après la validation bancaire : la commande est confirmée dès que Stripe confirme. */
function OrderReturn({ orderId, businessId }: { orderId: string; businessId: string }) {
  const t = useTranslations("site.shop");
  const [state, setState] = useState<OrderOutcome | null>(null);
  useEffect(() => {
    void confirmOrderAction(businessId, orderId).then((result) => {
      if (result.ok && result.data.status !== "pending_payment") clearCart();
      setState(result.ok ? result.data : { status: "pending_payment", reference: "", fulfillment: "pickup" });
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
