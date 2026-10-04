"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  buyGiftCardAction,
  confirmGiftCardAction,
  type GiftCheckout,
} from "@/app/(tenant)/sites/[tenantId]/carte-cadeau/actions";
import { DepositPayment } from "@/components/booking/DepositPayment";
import { money } from "@/components/booking/format";

type Props = {
  businessId: string;
  businessName: string;
  locale: string;
  currency: string;
  amounts: number[];
  minCents: number;
  maxCents: number;
  validityMonths: number;
  today: string;
  rulesPath: string;
  returnPath: string;
};

const inputClass =
  "block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 py-3 text-lg text-site-text";
const primaryClass =
  "inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50 sm:w-auto";

/** Achat d'une carte cadeau : montant, destinataire, message, date d'envoi, puis paiement. */
export function GiftCardForm(props: Props) {
  const t = useTranslations("site.giftCard");
  const tErrors = useTranslations("errors");
  const [amount, setAmount] = useState<number | null>(props.amounts[1] ?? props.amounts[0] ?? null);
  const [other, setOther] = useState("");
  const [error, setError] = useState<{ code: string; field?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [checkout, setCheckout] = useState<GiftCheckout | null>(null);
  const [sent, setSent] = useState<{ email: string; sendAt: string | null } | null>(null);
  const [recipient, setRecipient] = useState<{ email: string; sendOn: string }>({ email: "", sendOn: "" });
  const [checking, setChecking] = useState(false);
  const fmt = (cents: number) => money(cents, props.currency, props.locale);
  const chosenCents = other ? Math.round(Number(other.replace(",", ".")) * 100) : amount;

  async function submit(form: FormData) {
    setPending(true);
    setError(null);
    const recipientEmail = String(form.get("recipientEmail") ?? "");
    const purchaserEmail = String(form.get("purchaserEmail") ?? "");
    const sendOn = String(form.get("sendOn") ?? "");
    setRecipient({ email: recipientEmail || purchaserEmail, sendOn });
    const result = await buyGiftCardAction(props.businessId, {
      amount: other || (amount ? String(amount / 100) : ""),
      purchaserName: String(form.get("purchaserName") ?? ""),
      purchaserEmail,
      recipientName: String(form.get("recipientName") ?? ""),
      recipientEmail,
      message: String(form.get("message") ?? ""),
      sendOn,
      locale: props.locale,
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
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await confirmGiftCardAction(props.businessId, checkout.giftCardId);
      if (result.ok && result.data.active) {
        const later = recipient.sendOn && recipient.sendOn > props.today;
        setSent({ email: recipient.email, sendAt: later ? result.data.sendAt : null });
        setChecking(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setChecking(false);
    setSent({ email: recipient.email, sendAt: null });
  }

  if (sent) {
    return (
      <section role="status" className="rounded-site bg-site-panel p-6 text-center sm:p-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#2f9e5b] text-white">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="mt-4 font-site-display text-3xl font-semibold text-site-heading">
          {t("thanksTitle")}
        </h2>
        <p className="mt-3">
          {sent.sendAt
            ? t("thanksLater", {
                email: sent.email,
                date: new Intl.DateTimeFormat(props.locale, { day: "numeric", month: "long" }).format(
                  new Date(sent.sendAt),
                ),
              })
            : t("thanksNow", { email: sent.email })}
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
            locale={props.locale}
            holdExpiresAt={null}
            returnPath={props.returnPath}
            onPaid={paid}
            labels={{
              title: t("paymentTitle"),
              pay: t("pay", { amount: fmt(checkout.amountCents) }),
              secure: t("secureTo", { name: props.businessName }),
            }}
          />
        )}
      </section>
    );
  }

  const fieldError = (name: string) => (error?.field === name ? true : undefined);
  return (
    <form action={submit} className="space-y-8">
      <fieldset>
        <legend className="mb-3 text-lg font-semibold">{t("amount")}</legend>
        <div className="flex flex-wrap gap-2">
          {props.amounts.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={!other && amount === value}
              onClick={() => {
                setAmount(value);
                setOther("");
              }}
              className="min-h-12 rounded-full border border-site-border bg-site-card px-5 text-lg font-semibold aria-pressed:border-site-button aria-pressed:bg-site-button aria-pressed:text-site-on-button"
            >
              {fmt(value)}
            </button>
          ))}
        </div>
        <label htmlFor="g-other" className="mt-4 mb-2 block text-site-muted">
          {t("otherAmount", { min: fmt(props.minCents), max: fmt(props.maxCents) })}
        </label>
        <input
          id="g-other"
          inputMode="decimal"
          value={other}
          onChange={(event) => setOther(event.target.value)}
          aria-invalid={fieldError("amount")}
          className={`${inputClass} max-w-48`}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("recipient")}</legend>
        <Field name="recipientName" label={t("recipientName")} autoComplete="off" />
        <Field
          name="recipientEmail"
          type="email"
          label={t("recipientEmail")}
          invalid={fieldError("recipientEmail")}
        />
        <div className="sm:col-span-2">
          <label htmlFor="g-message" className="mb-2 block font-semibold">
            {t("message")}
          </label>
          <textarea id="g-message" name="message" rows={3} maxLength={500} className={inputClass} />
        </div>
        <div>
          <Field
            name="sendOn"
            type="date"
            label={t("sendOn")}
            min={props.today}
            invalid={fieldError("sendOn")}
          />
          <p className="mt-1 text-sm text-site-muted">{t("sendOnHint")}</p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">{t("from")}</legend>
        <Field
          name="purchaserName"
          label={t("purchaserName")}
          autoComplete="name"
          required
          invalid={fieldError("purchaserName")}
        />
        <Field
          name="purchaserEmail"
          type="email"
          label={t("purchaserEmail")}
          autoComplete="email"
          required
          invalid={fieldError("purchaserEmail")}
        />
      </fieldset>

      <p className="text-sm text-site-muted">
        {t("rules", { months: props.validityMonths })}{" "}
        <Link href={props.rulesPath} className="underline">
          {t("rulesLink")}
        </Link>
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-site border border-site-border bg-site-panel px-4 py-3 font-semibold"
        >
          {tErrors(error.code as "invalid")}
        </p>
      )}
      <button type="submit" disabled={pending || !chosenCents} className={primaryClass}>
        {pending ? t("sending") : chosenCents ? t("pay", { amount: fmt(chosenCents) }) : t("continue")}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  autoComplete,
  min,
  invalid,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  min?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`g-${name}`} className="mb-2 block font-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={`g-${name}`}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        min={min}
        aria-invalid={invalid}
        className={inputClass}
      />
    </div>
  );
}
