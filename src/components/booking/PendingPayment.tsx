"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { confirmPaymentAction } from "@/app/(tenant)/sites/[tenantId]/reserver/actions";
import { DepositPayment, type DepositCheckout } from "./DepositPayment";

/** Paiement de l'acompte repris depuis le lien de gestion (créneau encore réservé). */
export function PendingPayment(props: {
  token: string;
  checkout: DepositCheckout;
  amountCents: number;
  currency: string;
  locale: string;
  holdExpiresAt: string | null;
  returnPath: string;
}) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  async function paid() {
    setChecking(true);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await confirmPaymentAction(props.token);
      if (result.ok && result.data.status !== "pending_payment") break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    router.refresh();
  }

  return (
    <section className="rounded-site border border-site-border p-6">
      <h2 className="mb-4 font-site-display text-2xl font-semibold text-site-heading">
        {t("manage.payNow")}
      </h2>
      {checking ? (
        <p role="status" className="font-semibold">
          {t("payment.checking")}
        </p>
      ) : (
        <DepositPayment
          checkout={props.checkout}
          amountCents={props.amountCents}
          currency={props.currency}
          locale={props.locale}
          holdExpiresAt={props.holdExpiresAt}
          returnPath={props.returnPath}
          onPaid={paid}
        />
      )}
    </section>
  );
}
