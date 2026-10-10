"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import {
  dependenciesOf,
  dependentsOf,
  monthlyTotal,
  type PricedOption,
} from "@/modules/billing/option-total";
import { ArrowIcon, CheckIcon, optionIcon } from "./icons";

export type ConfiguratorOption = PricedOption & {
  name: string;
  description: string;
  icon: string;
  /** Livrée (sinon « Bientôt »). */
  available: boolean;
};

export type ConfiguratorPlan = { code: string; name: string; priceCents: number };

/**
 * « Personnalisez votre site selon votre activité » : les options en cartes,
 * à cocher, et le total mensuel de l'abonnement (pack + options) calculé avec
 * la même fonction que la commande. Une option qui en demande une autre
 * l'ajoute ; la retirer retire celles qui en dépendent. Les options sans
 * tarif fixé ou pas encore livrées s'affichent, sans pouvoir être cochées.
 */
export function OptionsConfigurator({
  plans,
  options,
  defaultPlan,
  display,
  salesOpen,
}: {
  plans: ConfiguratorPlan[];
  options: ConfiguratorOption[];
  defaultPlan: string;
  display: string;
  salesOpen: boolean;
}) {
  const t = useTranslations("home.options");
  const locale = useLocale();
  const id = useId();
  const [planCode, setPlanCode] = useState(defaultPlan);
  const [selected, setSelected] = useState<string[]>([]);
  const money = (cents: number) => formatMoney(cents, "EUR", locale);
  const plan = plans.find((item) => item.code === planCode) ?? plans[0];
  const total = useMemo(
    () => monthlyTotal(plan?.priceCents ?? 0, selected, options),
    [plan, selected, options],
  );
  const nameOf = (code: string) => options.find((option) => option.code === code)?.name ?? code;
  const orderable = (option: ConfiguratorOption) => option.orderable && option.priceCents !== null;

  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code && !dependentsOf(code, current, options).includes(item))
        : total.codes.concat(code),
    );

  if (!plan) return null;
  const href = {
    pathname: salesOpen ? ("/commander" as const) : ("/rappel" as const),
    query: {
      pack: plan.code,
      ...(salesOpen && total.codes.length > 0 ? { options: total.codes.join(",") } : {}),
    },
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {options.map((option) => {
          const Icon = optionIcon(option.icon);
          const checked = total.codes.includes(option.code);
          const canPick = orderable(option);
          // Ajoutée parce qu'une autre option cochée en a besoin.
          const neededBy = total.codes.filter(
            (code) => code !== option.code && dependenciesOf(code, options).includes(option.code),
          );
          const requires = option.requires.map(nameOf);
          const inputId = `${id}-${option.code}`;
          return (
            <li key={option.code} className="flex">
              <label
                htmlFor={inputId}
                className={`group relative flex w-full flex-col gap-2.5 rounded-[1.5rem] border-2 bg-white p-5 transition duration-200 lg:p-6 ${
                  canPick
                    ? "cursor-pointer hover:-translate-y-1 hover:shadow-[0_22px_44px_-18px_rgba(22,24,29,.25)] motion-reduce:hover:translate-y-0"
                    : "opacity-80"
                } ${checked ? "border-copper shadow-[0_18px_40px_-20px_rgba(154,90,36,.45)]" : "border-line hover:border-gold"}`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  disabled={!canPick}
                  onChange={() => toggle(option.code)}
                />
                <span className="flex items-start justify-between gap-3">
                  <span
                    className={`flex size-12 flex-none items-center justify-center rounded-2xl transition ${
                      checked ? "bg-navy text-gold" : "bg-cream text-copper"
                    }`}
                  >
                    <Icon className="size-6" />
                  </span>
                  {/* Case dessinée : le vrai champ est lu par les lecteurs d'écran ; contour visible au clavier. */}
                  {canPick && (
                    <span
                      aria-hidden="true"
                      className={`flex size-7 flex-none items-center justify-center rounded-full border-2 transition peer-focus-visible:ring-4 peer-focus-visible:ring-navy/30 ${
                        checked
                          ? "border-copper bg-copper text-white"
                          : "border-line bg-white text-transparent"
                      }`}
                    >
                      <CheckIcon className="size-4" />
                    </span>
                  )}
                </span>
                <span className="font-sans text-[1.08rem] font-semibold leading-snug text-night">
                  {option.name}
                </span>
                <span className="flex-1 text-[0.93rem] leading-snug text-body">{option.description}</span>
                <span className="flex flex-wrap items-center gap-2 text-[0.82rem]">
                  {!option.available ? (
                    <span className="rounded-full bg-sand px-2.5 py-1 font-semibold uppercase tracking-[0.05em] text-stone">
                      {t("soon")}
                    </span>
                  ) : option.priceCents === null ? (
                    <span className="rounded-full bg-sand px-2.5 py-1 font-semibold text-stone">
                      {t("onRequest")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-cream px-2.5 py-1 font-semibold text-copper">
                      {t("price", { amount: money(option.priceCents) })}
                    </span>
                  )}
                  {requires.length > 0 && (
                    <span className="text-stone">{t("requires", { names: requires.join(", ") })}</span>
                  )}
                </span>
                {neededBy.length > 0 && (
                  <span className="text-[0.82rem] font-medium text-copper">
                    {t("addedWith", { names: neededBy.map(nameOf).join(", ") })}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {/* Récapitulatif : collé en haut de l'écran sur ordinateur. */}
      <aside
        aria-labelledby={`${id}-summary`}
        className="relative overflow-hidden rounded-[1.75rem] border-2 border-gold bg-navy p-6 text-sand shadow-[0_28px_60px_-18px_rgba(27,42,74,.5)] lg:sticky lg:top-24 lg:p-7"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 size-36 rounded-full border-[1.1rem] border-navy-light"
        />
        <h3 id={`${id}-summary`} className="relative font-display text-[1.3rem] font-bold text-white">
          {t("summary")}
        </h3>
        <fieldset className="relative mt-4">
          <legend className="mb-2 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-gold">
            {t("pack")}
          </legend>
          <div className="grid grid-cols-3 gap-1.5 rounded-full bg-navy-light p-1">
            {plans.map((item) => (
              <label
                key={item.code}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full px-2 text-center text-[0.85rem] font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gold ${
                  item.code === plan.code ? "bg-gold text-navy" : "text-[#c9d0de] hover:text-white"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-plan`}
                  value={item.code}
                  checked={item.code === plan.code}
                  onChange={() => setPlanCode(item.code)}
                  className="sr-only"
                />
                {item.name}
              </label>
            ))}
          </div>
        </fieldset>
        <dl className="relative mt-5 flex flex-col gap-2 text-[0.92rem]">
          <div className="flex justify-between gap-3">
            <dt>{t("packPrice", { plan: plan.name })}</dt>
            <dd className="font-semibold text-white">{money(plan.priceCents)}</dd>
          </div>
          {total.lines.length === 0 ? (
            <div className="text-[#c9d0de]">
              <dt className="sr-only">{t("summary")}</dt>
              <dd>{t("none")}</dd>
            </div>
          ) : (
            total.lines.map((line) => (
              <div key={line.code} className="flex justify-between gap-3">
                <dt>{nameOf(line.code)}</dt>
                <dd className="font-semibold text-white">+ {money(line.priceCents)}</dd>
              </div>
            ))
          )}
        </dl>
        <p
          className="relative mt-5 flex items-baseline justify-between gap-3 border-t border-[#34466b] pt-4"
          aria-live="polite"
        >
          <span className="text-[0.95rem] font-semibold text-white">{t("total")}</span>
          <span>
            <span className="font-display text-[2.1rem] font-bold leading-none tracking-[-0.03em] text-white">
              {money(total.totalCents)}
            </span>{" "}
            <span className="text-[0.85rem] text-[#c9d0de]">{t("perMonth", { display })}</span>
          </span>
        </p>
        <Link
          href={href}
          className="group relative mt-6 flex min-h-12 items-center justify-center gap-2 rounded-full bg-brick px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(212,64,47,.38)] motion-reduce:transition-none"
        >
          {salesOpen ? t("cta") : t("ctaCallback")}
          <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-1" />
        </Link>
        <p className="relative mt-4 text-[0.8rem] leading-snug text-[#c9d0de]">
          {options.some((option) => orderable(option)) ? t("note") : t("noneOrderable")}
        </p>
      </aside>
    </div>
  );
}
