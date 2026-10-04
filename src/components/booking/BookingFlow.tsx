"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bookAction,
  getAvailabilityAction,
  type BookingConfirmation,
} from "@/app/(tenant)/sites/[tenantId]/reserver/actions";
import { durationLabel, formatLongDate, formatTimeOf, money } from "./format";
import { SlotPicker, type PickedSlot } from "./SlotPicker";

export type FlowService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  priceFrom: boolean;
  categoryName: string | null;
};

type Props = {
  locale: string;
  timezone: string;
  currency: string;
  services: FlowService[];
  staff: { id: string; name: string; serviceIds: string[] }[];
  maxServices: number;
  preselectedServiceId: string | null;
  deposit: { enabled: boolean; type: "percent" | "fixed"; value: number };
  holdMinutes: number;
  cancellationHours: number;
  privacyPath: string;
  managePath: string;
};

type Step = "services" | "slot" | "details" | "done";

const inputClass =
  "block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 py-3 text-lg text-site-text";
const primaryClass =
  "inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50 sm:w-auto";

/**
 * Parcours de réservation en 4 étapes, sans compte : prestation, créneau,
 * coordonnées, puis acompte si l'établissement l'a activé.
 */
export function BookingFlow(props: Props) {
  const t = useTranslations("booking");
  const tErrors = useTranslations("errors");
  const [step, setStep] = useState<Step>("services");
  const [selected, setSelected] = useState<string[]>(
    props.preselectedServiceId ? [props.preselectedServiceId] : [],
  );
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // À chaque étape, le titre reçoit le focus (lecteurs d'écran, navigation au clavier).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const chosen = props.services.filter((service) => selected.includes(service.id));
  const totalCents = chosen.reduce((sum, service) => sum + service.priceCents, 0);
  const totalMinutes = chosen.reduce((sum, service) => sum + service.durationMinutes, 0);
  const depositCents = !props.deposit.enabled
    ? 0
    : props.deposit.type === "percent"
      ? Math.round((totalCents * props.deposit.value) / 100)
      : Math.min(props.deposit.value, totalCents);
  const eligibleStaff = props.staff.filter((member) =>
    selected.every((id) => member.serviceIds.includes(id)),
  );
  const steps: Step[] =
    depositCents > 0 ? ["services", "slot", "details", "done"] : ["services", "slot", "details"];
  const stepLabels: Record<Step, string> = {
    services: t("steps.services"),
    slot: t("steps.slot"),
    details: t("steps.details"),
    done: t("steps.payment"),
  };

  const toggle = (id: string) => {
    setError(null);
    setSlot(null);
    if (selected.includes(id)) setSelected(selected.filter((item) => item !== id));
    else if (props.maxServices === 1) setSelected([id]);
    else if (selected.length < props.maxServices) setSelected([...selected, id]);
  };

  const loadDays = useCallback(
    (staffId: string | null, fromDate?: string) =>
      getAvailabilityAction({ serviceIds: selected, staffId, fromDate, days: 14 }),
    [selected],
  );

  async function submit(form: FormData) {
    if (!slot) return;
    setPending(true);
    setError(null);
    const result = await bookAction({
      serviceIds: selected,
      staffId: slot.staffId,
      start: slot.start,
      website: String(form.get("website") ?? ""),
      customer: {
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        note: String(form.get("note") ?? ""),
        marketingConsent: form.get("marketingConsent") === "on",
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      if (result.error === "slot_unavailable") {
        setSlot(null);
        setStep("slot");
      }
      return;
    }
    setConfirmation(result.data);
    setStep("done");
  }

  const errorBox = error && (
    <p
      role="alert"
      className="rounded-site border border-site-border bg-site-surface px-4 py-3 font-semibold text-site-text"
    >
      {tErrors(error as "invalid")}
    </p>
  );

  // ─── Confirmation ──────────────────────────────────────────────────────────
  if (step === "done" && confirmation) {
    const pendingPayment = confirmation.status === "pending_payment";
    const manageUrl = `${props.managePath}/${confirmation.manageToken}`;
    return (
      <section aria-labelledby="titre-etape" className="rounded-site bg-site-surface p-6 sm:p-8">
        <h2
          id="titre-etape"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-accent"
        >
          {pendingPayment ? t("confirmation.pendingTitle") : `✓ ${t("confirmation.title")}`}
        </h2>
        <p className="mt-4 text-lg">
          {t("confirmation.summary", {
            date: formatLongDate(confirmation.startsAt, props.locale, props.timezone),
            time: formatTimeOf(confirmation.startsAt, props.locale, props.timezone),
            name: confirmation.staffName,
          })}
        </p>
        <ul className="mt-2 text-site-muted">
          {chosen.map((service) => (
            <li key={service.id}>{service.name}</li>
          ))}
        </ul>
        <p className="mt-2 font-semibold">
          {t("details.total")} : {money(confirmation.totalCents, confirmation.currency, props.locale)}
        </p>
        {pendingPayment && (
          <div className="mt-6 rounded-site border border-site-border p-4">
            <h3 className="font-semibold">
              {t("payment.title")} : {money(confirmation.depositCents, confirmation.currency, props.locale)}
            </h3>
            <p className="mt-2">{t("payment.held", { minutes: props.holdMinutes })}</p>
            <p className="mt-2 text-site-muted">{t("payment.soon")}</p>
          </div>
        )}
        <p className="mt-6">{t("confirmation.keepLink", { hours: props.cancellationHours })}</p>
        <Link href={manageUrl} className={`mt-3 ${primaryClass}`}>
          {t("confirmation.manageLink")}
        </Link>
        <p className="mt-4 text-sm text-site-muted">{t("confirmation.emailSoon")}</p>
      </section>
    );
  }

  const index = steps.indexOf(step);
  return (
    <div className="space-y-6">
      <ol className="flex gap-2" aria-label={t("title")}>
        {steps.map((item, i) => (
          <li
            key={item}
            aria-current={item === step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-site-button" : "bg-site-border"}`}
          >
            <span className="sr-only">{stepLabels[item]}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-site-muted">
        {t("stepOf", { current: index + 1, total: steps.length, label: stepLabels[step] })}
      </p>

      {/* ─── 1. Prestations ─── */}
      {step === "services" && (
        <section aria-labelledby="titre-etape" className="space-y-4">
          <h2
            id="titre-etape"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-accent"
          >
            {props.maxServices > 1
              ? t("services.chooseMany", { max: props.maxServices })
              : t("services.choose")}
          </h2>
          {[...new Set(props.services.map((service) => service.categoryName))].map((category) => (
            <fieldset key={category ?? "none"} className="min-w-0 space-y-2">
              {category !== null && (
                <legend className="mb-2 text-lg font-semibold text-site-text">{category}</legend>
              )}
              {props.services
                .filter((service) => service.categoryName === category)
                .map((service) => {
                  const checked = selected.includes(service.id);
                  const disabled = !checked && props.maxServices > 1 && selected.length >= props.maxServices;
                  return (
                    <label
                      key={service.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-site border p-4 ${checked ? "border-site-button bg-site-surface" : "border-site-border"} ${disabled ? "opacity-50" : ""} has-[:focus-visible]:outline has-[:focus-visible]:outline-2`}
                    >
                      <input
                        type={props.maxServices > 1 ? "checkbox" : "radio"}
                        name="service"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(service.id)}
                        className="mt-1 h-5 w-5 accent-[var(--site-button)]"
                      />
                      <span className="flex-1">
                        <span className="block font-semibold text-site-text">{service.name}</span>
                        {service.description && (
                          <span className="block text-sm text-site-muted">{service.description}</span>
                        )}
                      </span>
                      <span className="text-right text-site-text">
                        <span className="block font-semibold">
                          {money(service.priceCents, props.currency, props.locale)}
                        </span>
                        <span className="block text-sm text-site-muted">
                          {durationLabel(service.durationMinutes)}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </fieldset>
          ))}
          {props.maxServices > 1 && selected.length >= props.maxServices && (
            <p className="text-sm text-site-muted">{t("services.maxReached")}</p>
          )}
          <div className="sticky bottom-24 rounded-site border border-site-border bg-site-bg p-4 shadow-lg sm:bottom-4">
            <p className="mb-3 text-site-text" aria-live="polite">
              {t("services.selected", {
                count: chosen.length,
                duration: durationLabel(totalMinutes),
                price: money(totalCents, props.currency, props.locale),
              })}
            </p>
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() => setStep("slot")}
              className={primaryClass}
            >
              {t("continue")}
            </button>
          </div>
        </section>
      )}

      {/* ─── 2. Créneau ─── */}
      {step === "slot" && (
        <section aria-labelledby="titre-etape" className="space-y-4">
          <h2
            id="titre-etape"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-accent"
          >
            {t("steps.slot")}
          </h2>
          <p className="text-site-muted">
            {chosen.map((service) => service.name).join(" + ")} · {durationLabel(totalMinutes)}{" "}
            <button
              type="button"
              onClick={() => setStep("services")}
              className="font-semibold text-site-accent underline"
            >
              {t("change")}
            </button>
          </p>
          {errorBox}
          <SlotPicker
            locale={props.locale}
            staffOptions={eligibleStaff.map((member) => ({ id: member.id, name: member.name }))}
            loadDays={loadDays}
            selected={slot}
            onError={setError}
            onPick={(picked) => {
              setError(null);
              setSlot(picked);
              setStep("details");
            }}
          />
          <button
            type="button"
            onClick={() => setStep("services")}
            className="font-semibold text-site-accent underline"
          >
            ← {t("back")}
          </button>
        </section>
      )}

      {/* ─── 3. Coordonnées ─── */}
      {step === "details" && slot && (
        <section aria-labelledby="titre-etape" className="space-y-6">
          <h2
            id="titre-etape"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-accent"
          >
            {t("details.title")}
          </h2>
          <div className="rounded-site bg-site-surface p-4">
            <h3 className="font-semibold">{t("details.summary")}</h3>
            <p className="mt-1">
              {t("slot.chosen", {
                date: formatLongDate(slot.start, props.locale, props.timezone),
                time: formatTimeOf(slot.start, props.locale, props.timezone),
              })}
              {slot.staffId &&
                ` ${t("details.with", { name: props.staff.find((m) => m.id === slot.staffId)?.name ?? "" })}`}{" "}
              <button
                type="button"
                onClick={() => setStep("slot")}
                className="font-semibold text-site-accent underline"
              >
                {t("change")}
              </button>
            </p>
            <p className="text-site-muted">{chosen.map((service) => service.name).join(" + ")}</p>
            <p className="mt-1 font-semibold">
              {t("details.total")} : {money(totalCents, props.currency, props.locale)}
            </p>
            {depositCents > 0 && (
              <p className="font-semibold">
                {t("details.deposit")} : {money(depositCents, props.currency, props.locale)}
              </p>
            )}
          </div>
          {errorBox}
          <form action={submit} className="space-y-4">
            {/* Champ piège pour les robots : invisible pour les personnes. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="firstName" label={t("details.firstName")} autoComplete="given-name" required />
              <Field name="lastName" label={t("details.lastName")} autoComplete="family-name" />
              <Field
                name="email"
                type="email"
                label={t("details.email")}
                hint={t("details.emailHint")}
                autoComplete="email"
                inputMode="email"
                required
              />
              <Field
                name="phone"
                type="tel"
                label={t("details.phone")}
                hint={t("details.phoneHint")}
                autoComplete="tel"
                inputMode="tel"
                required
              />
            </div>
            <div>
              <label htmlFor="b-note" className="mb-2 block font-semibold text-site-text">
                {t("details.note")}
              </label>
              <textarea id="b-note" name="note" rows={2} maxLength={500} className={inputClass} />
            </div>
            <label className="flex items-start gap-3 text-site-text">
              <input
                type="checkbox"
                name="marketingConsent"
                className="mt-1 h-5 w-5 accent-[var(--site-button)]"
              />
              <span>{t("details.marketingConsent")}</span>
            </label>
            <p className="text-sm text-site-muted">
              {t("details.privacy")}{" "}
              <Link href={props.privacyPath} className="underline">
                {t("details.privacyLink")}
              </Link>
            </p>
            <button type="submit" disabled={pending} className={primaryClass}>
              {pending
                ? t("details.sending")
                : depositCents > 0
                  ? t("details.confirmPay")
                  : t("details.confirm")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  hint,
  type = "text",
  required,
  autoComplete,
  inputMode,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "email" | "tel";
}) {
  return (
    <div>
      <label htmlFor={`b-${name}`} className="mb-2 block font-semibold text-site-text">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={`b-${name}`}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-describedby={hint ? `b-${name}-hint` : undefined}
        className={inputClass}
      />
      {hint && (
        <p id={`b-${name}-hint`} className="mt-1 text-sm text-site-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
