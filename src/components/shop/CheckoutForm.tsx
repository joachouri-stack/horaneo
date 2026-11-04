"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import {
  confirmOrderAction,
  startCheckoutAction,
  type ShopCheckout,
} from "@/app/(tenant)/sites/[tenantId]/panier/actions";
import { useSiteError } from "@/components/booking/hooks";
import { DepositPayment } from "@/components/booking/DepositPayment";
import { SHOP } from "@/config/shop";
import { formatMoney } from "@/lib/format";
import { SITE_PATHS } from "@/modules/site/paths";
import { clearCart, type Cart } from "./cart-store";

const inputClass =
  "block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 py-3 text-lg text-site-text";

/** Coordonnées, puis paiement par carte (Stripe), puis remerciement. */
export function CheckoutForm({
  cart,
  locale,
  businessName,
}: {
  cart: Cart;
  locale: string;
  businessName: string;
}) {
  const t = useTranslations("site.shop");
  const errorText = useSiteError();
  const [checkout, setCheckout] = useState<ShopCheckout | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<{ code: string; field?: string } | null>(null);
  const [done, setDone] = useState<{ status: string; reference: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await startCheckoutAction(cart.businessId, {
      items: cart.items,
      customerName: String(form.get("customerName") ?? ""),
      customerEmail: String(form.get("customerEmail") ?? ""),
      customerPhone: String(form.get("customerPhone") ?? ""),
      note: String(form.get("note") ?? ""),
      acceptTerms: form.get("acceptTerms") === "on",
    });
    setPending(false);
    if (!result.ok) {
      setError({ code: result.error, field: result.field });
      return;
    }
    setCheckout(result.data);
  }

  async function paid() {
    if (!checkout) return;
    setChecking(true);
    const result = await confirmOrderAction(cart.businessId, checkout.orderId);
    setChecking(false);
    clearCart();
    setDone(result.ok ? result.data : { status: "pending_payment", reference: checkout.reference });
  }

  if (done) {
    return (
      <section role="status" className="rounded-site bg-site-panel p-6 sm:p-8">
        <h2 className="font-site-display text-2xl font-semibold text-site-heading">{t("thanksTitle")}</h2>
        <p className="mt-3 text-lg">
          {done.status === "refunded"
            ? t("refunded")
            : done.status === "paid"
              ? t("thanksText", { reference: done.reference })
              : t("thanksPending")}
        </p>
      </section>
    );
  }

  if (checkout) {
    return (
      <section className="rounded-site bg-site-panel p-6 sm:p-8">
        {checking ? (
          <p role="status" className="font-semibold">
            {t("checking")}
          </p>
        ) : (
          <DepositPayment
            checkout={checkout.payment}
            amountCents={checkout.amountCents}
            currency={checkout.currency}
            locale={locale}
            holdExpiresAt={checkout.holdExpiresAt}
            returnPath={`${SITE_PATHS.cart}?commande=${checkout.orderId}&avec=${cart.businessId}`}
            onPaid={paid}
            onRestart={() => setCheckout(null)}
            labels={{
              title: t("payTitle"),
              pay: t("pay", { amount: formatMoney(checkout.amountCents, checkout.currency, locale) }),
              secure: t("secureTo", { name: businessName }),
              expired: t("expired"),
              restart: t("restart"),
            }}
          />
        )}
      </section>
    );
  }

  const invalid = (field: string) => (error?.field === field ? true : undefined);
  return (
    <form onSubmit={submit} className="space-y-5 rounded-site bg-site-panel p-6 sm:p-8" noValidate>
      <h2 className="font-site-display text-2xl font-semibold text-site-heading">{t("checkoutTitle")}</h2>
      <div>
        <label htmlFor="shop-name" className="mb-1 block font-semibold">
          {t("name")}
        </label>
        <input
          id="shop-name"
          name="customerName"
          autoComplete="name"
          required
          aria-invalid={invalid("customerName")}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="shop-email" className="mb-1 block font-semibold">
          {t("email")}
        </label>
        <input
          id="shop-email"
          name="customerEmail"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          aria-invalid={invalid("customerEmail")}
          aria-describedby="shop-email-hint"
          className={inputClass}
        />
        <p id="shop-email-hint" className="mt-1 text-sm text-site-muted">
          {t("emailHint")}
        </p>
      </div>
      <div>
        <label htmlFor="shop-phone" className="mb-1 block font-semibold">
          {t("phone")}
        </label>
        <input
          id="shop-phone"
          name="customerPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={invalid("customerPhone")}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="shop-note" className="mb-1 block font-semibold">
          {t("note")}
        </label>
        <textarea id="shop-note" name="note" rows={3} maxLength={500} className={inputClass} />
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="acceptTerms" required className="mt-1 size-5 shrink-0" />
        <span>
          {t.rich("terms", {
            link: (chunks) => (
              <Link
                href={`${SITE_PATHS.cancellation}#boutique`}
                target="_blank"
                className="font-semibold underline underline-offset-4"
              >
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {errorText(error.code)}
        </p>
      )}
      <p className="text-sm text-site-muted">{t("holdNote", { minutes: SHOP.holdMinutes })}</p>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50"
      >
        {t("continue")}
      </button>
    </form>
  );
}
