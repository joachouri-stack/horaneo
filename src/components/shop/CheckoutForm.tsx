"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import {
  confirmOrderAction,
  type OrderOutcome,
  startCheckoutAction,
  type CartView,
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
  view,
  locale,
  businessName,
}: {
  cart: Cart;
  /** Panier relu en base : sous-total et modes de remise proposés. */
  view: CartView;
  locale: string;
  businessName: string;
}) {
  const t = useTranslations("site.shop");
  const errorText = useSiteError();
  const [checkout, setCheckout] = useState<ShopCheckout | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<{ code: string; field?: string } | null>(null);
  const [done, setDone] = useState<OrderOutcome | null>(null);
  const options = view.fulfillment;
  const [mode, setMode] = useState<"pickup" | "delivery">(options.pickup ? "pickup" : "delivery");
  const delivering = mode === "delivery";
  const fee = delivering ? options.deliveryFeeCents : 0;
  const money = (cents: number) => formatMoney(cents, view.currency ?? "EUR", locale);

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
      fulfillment: mode,
      ...(delivering && {
        addressLine1: String(form.get("addressLine1") ?? ""),
        addressLine2: String(form.get("addressLine2") ?? ""),
        postalCode: String(form.get("postalCode") ?? ""),
        city: String(form.get("city") ?? ""),
      }),
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
    setDone(
      result.ok
        ? result.data
        : { status: "pending_payment", reference: checkout.reference, fulfillment: mode },
    );
  }

  if (done) {
    return (
      <section role="status" className="rounded-site bg-site-panel p-6 sm:p-8">
        <h2 className="font-site-display text-2xl font-semibold text-site-heading">{t("thanksTitle")}</h2>
        <p className="mt-3 text-lg">
          {done.status === "refunded"
            ? t("refunded")
            : done.status === "paid"
              ? t(done.fulfillment === "delivery" ? "thanksDelivery" : "thanksText", {
                  reference: done.reference,
                })
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
      {options.pickup && options.delivery && (
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{t("fulfillment")}</legend>
          {(["pickup", "delivery"] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-site border border-site-border bg-site-bg px-4 py-2"
            >
              <input
                type="radio"
                name="fulfillment"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="size-5 shrink-0"
              />
              <span className="flex-1">{t(value)}</span>
              <span className="text-site-muted">
                {value === "pickup"
                  ? t("free")
                  : options.deliveryFeeCents === 0
                    ? t("free")
                    : money(options.deliveryFeeCents)}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {delivering && (
        <fieldset className="space-y-4">
          <legend className="mb-1 font-semibold">{t("deliveryAddress")}</legend>
          {options.freeDeliveryFromCents !== null && options.deliveryFeeCents > 0 && (
            <p className="text-sm text-site-muted">
              {t("freeFrom", { amount: money(options.freeDeliveryFromCents) })}
            </p>
          )}
          {(
            [
              ["addressLine1", "address-line1", true],
              ["addressLine2", "address-line2", false],
              ["postalCode", "postal-code", true],
              ["city", "address-level2", true],
            ] as const
          ).map(([field, autoComplete, required]) => (
            <div key={field}>
              <label htmlFor={`shop-${field}`} className="mb-1 block font-semibold">
                {t(field)}
              </label>
              <input
                id={`shop-${field}`}
                name={field}
                autoComplete={autoComplete}
                required={required}
                inputMode={field === "postalCode" ? "numeric" : undefined}
                aria-invalid={invalid(field)}
                className={inputClass}
              />
            </div>
          ))}
        </fieldset>
      )}
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
      {delivering && (
        <dl className="space-y-1 border-t border-site-border pt-4 text-lg">
          <div className="flex justify-between">
            <dt>{t("deliveryFee")}</dt>
            <dd className="tabular-nums">{fee === 0 ? t("free") : money(fee)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>{t("toPay")}</dt>
            <dd className="tabular-nums">{money(view.totalCents + fee)}</dd>
          </div>
        </dl>
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
