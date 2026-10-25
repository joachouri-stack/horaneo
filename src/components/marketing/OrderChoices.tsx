"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { dependentsOf, monthlyTotal, type PricedOption } from "@/modules/billing/option-total";
import { yearlyPriceCents, type BillingInterval } from "@/modules/billing/yearly";

export type ConfiguratorOption = PricedOption & {
  name: string;
  description: string;
  icon: string;
  available: boolean;
};
export type ConfiguratorPlan = { code: string; name: string; priceCents: number };

/**
 * Choix du pack, de la périodicité et des options dans le formulaire de
 * commande (champs « planCode », « billing » et « options »), avec le total
 * calculé comme à la commande : par mois, ou par an avec les mois offerts.
 * Les options se facturent chaque mois : elles disparaissent à l'année.
 */
export function OrderChoices({
  plans,
  options,
  initialPlan,
  initialOptions,
  initialBilling,
  yearly,
  display,
  labels,
}: {
  plans: (ConfiguratorPlan & { note: string | null })[];
  options: ConfiguratorOption[];
  initialPlan: string;
  initialOptions: string[];
  initialBilling: BillingInterval;
  /** Paiement à l'année proposé, et ses mois offerts (réglages). */
  yearly: { enabled: boolean; freeMonths: number };
  display: string;
  labels: {
    plan: string;
    options: string;
    optionsHint: string;
    total: string;
    perMonth: string;
    perYear: string;
    billing: string;
    monthly: string;
    yearly: string;
    yearlyHint: string;
  };
}) {
  const t = useTranslations("home.options");
  const locale = useLocale();
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  const [planCode, setPlanCode] = useState(initialPlan);
  const [billing, setBilling] = useState<BillingInterval>(yearly.enabled ? initialBilling : "month");
  const annual = billing === "year";
  const priceOf = (cents: number) => (annual ? yearlyPriceCents(cents, yearly.freeMonths) : cents);
  const [selected, setSelected] = useState(() => monthlyTotal(0, initialOptions, options).codes);
  const plan = plans.find((item) => item.code === planCode) ?? plans[0];
  const total = useMemo(
    () => monthlyTotal(plan?.priceCents ?? 0, annual ? [] : selected, options),
    [plan, selected, options, annual],
  );
  const orderable = options.filter((option) => option.orderable && option.priceCents !== null);
  const card =
    "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-card)] border-2 border-navy/15 p-4 has-[:checked]:border-navy has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/40";

  return (
    <>
      <fieldset>
        <legend className="mb-2 block font-semibold text-night">{labels.plan}</legend>
        <div className="space-y-2">
          {plans.map((item) => (
            <label key={item.code} className={card}>
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="planCode"
                  value={item.code}
                  checked={item.code === planCode}
                  onChange={() => setPlanCode(item.code)}
                  className="h-5 w-5 accent-navy"
                />
                <span className="font-bold text-night">{item.name}</span>
              </span>
              <span className="text-right">
                {money(priceOf(item.priceCents))} {annual ? labels.perYear : labels.perMonth}
                {item.note && <span className="block text-sm text-ink/70">{item.note}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {yearly.enabled && (
        <fieldset>
          <legend className="mb-2 block font-semibold text-night">{labels.billing}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["month", "year"] as const).map((value) => (
              <label key={value} className={card}>
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="billing"
                    value={value}
                    checked={billing === value}
                    onChange={() => setBilling(value)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
                  />
                  <span>
                    <span className="block font-bold text-night">
                      {value === "month" ? labels.monthly : labels.yearly}
                    </span>
                    {value === "year" && (
                      <span className="block text-sm text-ink/70">{labels.yearlyHint}</span>
                    )}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {orderable.length > 0 && !annual && (
        <fieldset>
          <legend className="mb-1 block font-semibold text-night">{labels.options}</legend>
          <p className="mb-2 text-sm text-ink/70">{labels.optionsHint}</p>
          <div className="space-y-2">
            {orderable.map((option) => (
              <label key={option.code} className={card}>
                <span className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="options"
                    value={option.code}
                    checked={total.codes.includes(option.code)}
                    onChange={() =>
                      setSelected((current) =>
                        total.codes.includes(option.code)
                          ? current.filter(
                              (code) =>
                                code !== option.code &&
                                !dependentsOf(option.code, current, options).includes(code),
                            )
                          : total.codes.concat(option.code),
                      )
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-navy"
                  />
                  <span>
                    <span className="block font-bold text-night">{option.name}</span>
                    {option.requires.length > 0 && (
                      <span className="block text-sm text-ink/70">
                        {t("requires", {
                          names: option.requires
                            .map((code) => options.find((item) => item.code === code)?.name ?? code)
                            .join(", "),
                        })}
                      </span>
                    )}
                  </span>
                </span>
                <span className="whitespace-nowrap text-right">
                  {t("price", { amount: money(option.priceCents ?? 0) })}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p
        className="flex items-baseline justify-between gap-3 rounded-[var(--radius-card)] bg-navy px-4 py-3 text-white"
        aria-live="polite"
      >
        <span className="font-semibold">{labels.total}</span>
        <span>
          <span className="text-2xl font-bold">{money(priceOf(total.totalCents))}</span>{" "}
          <span className="text-sm text-white/80">
            {annual ? labels.perYear : t("perMonth", { display })}
          </span>
        </span>
      </p>
    </>
  );
}
