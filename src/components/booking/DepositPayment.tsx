"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance, type StripeElementLocale } from "@stripe/stripe-js";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { money } from "./format";

export type DepositCheckout = {
  clientSecret: string;
  accountId: string;
  publishableKey: string;
};

type Props = {
  checkout: DepositCheckout;
  amountCents: number;
  currency: string;
  locale: string;
  /** Fin de la réservation temporaire du créneau. */
  holdExpiresAt: string | null;
  /** Page de retour après une validation bancaire hors de la page (chemin sur le site). */
  returnPath: string;
  onPaid: () => Promise<void> | void;
  /** Textes propres à un autre achat (carte cadeau) : titre, bouton, mention sous le formulaire. */
  labels?: { title?: string; pay?: string; secure?: string };
};

const buttonClass =
  "inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50";

/** Couleurs du formulaire de carte : celles du site de l'établissement. */
function siteAppearance(element: HTMLElement | null): Appearance {
  const style = element ? getComputedStyle(element) : null;
  const read = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback;
  return {
    theme: "stripe",
    variables: {
      colorPrimary: read("--site-button", "#333333"),
      colorBackground: read("--site-bg", "#ffffff"),
      colorText: read("--site-text", "#1a1a1a"),
      colorDanger: "#b42318",
      fontSizeBase: "17px",
      borderRadius: "10px",
    },
  };
}

/** Secondes restantes (calculées seulement dans le navigateur, pour éviter un écart avec le serveur). */
function useRemaining(holdExpiresAt: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!holdExpiresAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [holdExpiresAt]);
  if (!holdExpiresAt || now === null) return null;
  return Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - now) / 1000));
}

/**
 * Paiement de l'acompte par carte (Apple Pay et Google Pay compris), sans quitter
 * le site : formulaire Stripe, sur le compte Stripe du professionnel.
 */
export function DepositPayment(props: Props) {
  const t = useTranslations("booking.payment");
  const ref = useRef<HTMLDivElement>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const stripePromise = useMemo(
    () => loadStripe(props.checkout.publishableKey, { stripeAccount: props.checkout.accountId }),
    [props.checkout.publishableKey, props.checkout.accountId],
  );
  const remaining = useRemaining(props.holdExpiresAt);

  useEffect(() => {
    setAppearance(siteAppearance(ref.current));
  }, []);

  if (remaining === 0) {
    return (
      <div role="alert" className="rounded-site border border-site-border p-4">
        <p className="font-semibold">{t("expired")}</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="space-y-4">
      <p className="text-lg font-semibold">
        {props.labels?.title ?? t("title")} : {money(props.amountCents, props.currency, props.locale)}
      </p>
      {remaining !== null && (
        <p className="text-site-muted" aria-live="off">
          {t("remaining", {
            time: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`,
          })}
        </p>
      )}
      {appearance && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret: props.checkout.clientSecret,
            appearance,
            locale: props.locale as StripeElementLocale,
          }}
        >
          <PaymentForm returnPath={props.returnPath} onPaid={props.onPaid} payLabel={props.labels?.pay} />
        </Elements>
      )}
      <p className="text-sm text-site-muted">{props.labels?.secure ?? t("secure")}</p>
    </div>
  );
}

function PaymentForm({
  returnPath,
  onPaid,
  payLabel,
}: Pick<Props, "returnPath" | "onPaid"> & { payLabel?: string }) {
  const t = useTranslations("booking.payment");
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: new URL(returnPath, window.location.href).href },
      redirect: "if_required",
    });
    if (result.error) {
      // Message de Stripe, déjà dans la langue de la cliente (carte refusée, etc.).
      setError(result.error.message ?? t("failed"));
      setPending(false);
      return;
    }
    await onPaid();
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && (
        <p
          role="alert"
          className="rounded-site border border-site-border bg-site-surface px-4 py-3 font-semibold"
        >
          {error}
        </p>
      )}
      <button type="submit" disabled={!stripe || pending} className={buttonClass}>
        {pending ? t("paying") : (payLabel ?? t("pay"))}
      </button>
    </form>
  );
}
