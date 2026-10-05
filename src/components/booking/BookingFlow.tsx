"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bookAction,
  checkPromoAction,
  confirmPaymentAction,
  getAvailabilityAction,
  checkGiftCardAction,
  type BookingConfirmation,
  type GiftPreview,
  type PromoPreview,
} from "@/app/(tenant)/sites/[tenantId]/reserver/actions";
import { DepositPayment } from "./DepositPayment";
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
  /** Promotion en cours : ancien prix barré. */
  regularPriceCents?: number | null;
};

type Props = {
  locale: string;
  timezone: string;
  currency: string;
  services: FlowService[];
  staff: { id: string; name: string; serviceIds: string[] }[];
  maxServices: number;
  preselectedServiceId: string | null;
  /** « Reprendre ce soin » : praticienne déjà choisie et passage direct au choix du créneau. */
  preselectedStaffId?: string | null;
  startAtSlot?: boolean;
  /** Cliente connectée à son espace : coordonnées déjà remplies. */
  prefill?: { firstName: string; lastName: string; email: string; phone: string } | null;
  /** Carte cadeau choisie depuis l'espace des clientes. */
  initialGiftCode?: string;
  deposit: { enabled: boolean; type: "percent" | "fixed"; value: number };
  promoEnabled: boolean;
  /** Pack avec cartes cadeaux : la carte peut remplacer l'acompte. */
  giftCardsEnabled?: boolean;
  holdMinutes: number;
  cancellationHours: number;
  privacyPath: string;
  managePath: string;
  /** Étapes déjà franchies avant ce parcours (ex. « Avec qui ? » sur un site à plusieurs entreprises). */
  stepOffset?: number;
  /** Adresse de l'étape précédente (retour au choix de la professionnelle). */
  previousHref?: string;
  /** Qui reçoit l'acompte (« versé directement à … »). */
  payeeName?: string;
  /** Adresse de l'établissement, rappelée sur la confirmation. */
  address?: string;
  siteName?: string;
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
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    props.preselectedServiceId && props.startAtSlot ? "slot" : "services",
  );
  const [selected, setSelected] = useState<string[]>(
    props.preselectedServiceId ? [props.preselectedServiceId] : [],
  );
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [giftCode, setGiftCode] = useState(props.initialGiftCode ?? "");
  const [gift, setGift] = useState<GiftPreview | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // À chaque étape, le titre reçoit le focus (lecteurs d'écran, navigation au clavier).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const chosen = props.services.filter((service) => selected.includes(service.id));
  const totalCents = chosen.reduce((sum, service) => sum + service.priceCents, 0);
  const totalMinutes = chosen.reduce((sum, service) => sum + service.durationMinutes, 0);
  const baseDepositCents = !props.deposit.enabled
    ? 0
    : props.deposit.type === "percent"
      ? Math.round((totalCents * props.deposit.value) / 100)
      : Math.min(props.deposit.value, totalCents);
  // Avec un code promo, les montants viennent du serveur (total réduit, acompte recalculé).
  const finalTotalCents = promo ? promo.totalCents : totalCents;
  const depositCents = promo ? promo.depositCents : baseDepositCents;
  const eligibleStaff = props.staff.filter((member) =>
    selected.every((id) => member.serviceIds.includes(id)),
  );
  const steps: Step[] =
    depositCents > 0 && !gift ? ["services", "slot", "details", "done"] : ["services", "slot", "details"];
  const stepLabels: Record<Step, string> = {
    services: t("steps.services"),
    slot: t("steps.slot"),
    details: t("steps.details"),
    done: t("steps.payment"),
  };

  const toggle = (id: string) => {
    setError(null);
    setSlot(null);
    setPromo(null);
    setGift(null);
    if (selected.includes(id)) setSelected(selected.filter((item) => item !== id));
    else if (props.maxServices === 1) setSelected([id]);
    else if (selected.length < props.maxServices) setSelected([...selected, id]);
  };

  const loadDays = useCallback(
    (staffId: string | null, fromDate?: string) =>
      getAvailabilityAction({ serviceIds: selected, staffId, fromDate, days: 14 }),
    [selected],
  );

  async function applyGiftCard() {
    if (!giftCode.trim()) return;
    setGiftError(null);
    const result = await checkGiftCardAction({
      code: giftCode,
      serviceIds: selected,
      promoCode: promo?.code,
    });
    if (!result.ok) {
      setGift(null);
      setGiftError(result.error);
      return;
    }
    setGift(result.data);
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoError(null);
    const result = await checkPromoAction({ code: promoCode, serviceIds: selected });
    if (!result.ok) {
      setPromo(null);
      setPromoError(result.error);
      return;
    }
    setPromo(result.data);
  }

  async function paid() {
    if (!confirmation) return;
    setChecking(true);
    // Stripe peut mettre quelques secondes à confirmer : jusqu'à 5 vérifications.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await confirmPaymentAction(confirmation.manageToken);
      if (result.ok && result.data.status === "confirmed") {
        setConfirmation({ ...confirmation, status: "confirmed", payment: null });
        setChecking(false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setChecking(false);
    // Le lien de gestion affichera l'état final dès que Stripe l'aura confirmé.
    router.push(`${props.managePath}/${confirmation.manageToken}`);
  }

  async function submit(form: FormData) {
    if (!slot) return;
    setPending(true);
    setError(null);
    const result = await bookAction({
      serviceIds: selected,
      staffId: slot.staffId,
      start: slot.start,
      promoCode: promo?.code,
      giftCardCode: gift ? giftCode : undefined,
      website: String(form.get("website") ?? ""),
      customer: {
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        note: String(form.get("note") ?? ""),
        beneficiaryName: String(form.get("beneficiaryName") ?? ""),
        marketingConsent: form.get("marketingConsent") === "on",
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      if (result.error === "promo_code_invalid") setPromo(null);
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
      <section aria-labelledby="titre-etape" className="rounded-site bg-site-panel p-6 sm:p-8">
        <h2
          id="titre-etape"
          ref={headingRef}
          tabIndex={-1}
          className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-heading"
        >
          {pendingPayment ? t("confirmation.pendingTitle") : t("confirmation.title")}
        </h2>
        {!pendingPayment && (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#2f9e5b] text-white">
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
            <p className="mt-3 text-site-muted">{t("confirmation.emailSent")}</p>
          </div>
        )}
        <div className="mt-6 rounded-site border border-site-border bg-site-card p-4">
          <p className="font-semibold">{chosen.map((service) => service.name).join(" + ")}</p>
          <p className="text-site-muted">
            {t("confirmation.summary", {
              date: formatLongDate(confirmation.startsAt, props.locale, props.timezone),
              time: formatTimeOf(confirmation.startsAt, props.locale, props.timezone),
              name: confirmation.staffName,
            })}
          </p>
        </div>
        <p className="mt-2 font-semibold">
          {t("details.total")} : {money(confirmation.totalCents, confirmation.currency, props.locale)}
        </p>
        {confirmation.paidWithGiftCard && <p className="text-site-muted">{t("giftCard.paidWith")}</p>}
        {confirmation.discountCents > 0 && (
          <p className="text-site-muted">
            {t("details.discount")} : −{" "}
            {money(confirmation.discountCents, confirmation.currency, props.locale)}
          </p>
        )}
        {pendingPayment && (
          <div className="mt-6 rounded-site border border-site-border p-4">
            <p className="mb-4">{t("payment.held", { minutes: props.holdMinutes })}</p>
            {checking ? (
              <p role="status" className="font-semibold">
                {t("payment.checking")}
              </p>
            ) : confirmation.payment ? (
              <>
                <DepositPayment
                  checkout={confirmation.payment}
                  amountCents={confirmation.depositCents}
                  currency={confirmation.currency}
                  locale={props.locale}
                  holdExpiresAt={confirmation.holdExpiresAt}
                  returnPath={manageUrl}
                  onPaid={paid}
                />
                {props.payeeName && (
                  <p className="mt-3 text-center text-sm text-site-muted">
                    {t("payment.secureTo", { name: props.payeeName })}
                  </p>
                )}
              </>
            ) : (
              <p>{t("payment.unavailable")}</p>
            )}
          </div>
        )}
        {props.address && <p className="mt-3 text-sm text-site-muted">{props.address}</p>}
        <p className="mt-6">{t("confirmation.keepLink", { hours: props.cancellationHours })}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!pendingPayment && (
            <a
              href={calendarFile({
                title: [chosen.map((service) => service.name).join(" + "), props.siteName]
                  .filter(Boolean)
                  .join(" · "),
                start: confirmation.startsAt,
                end: confirmation.endsAt,
                location: props.address ?? "",
              })}
              download="rendez-vous.ics"
              className={primaryClass}
            >
              {t("confirmation.addToCalendar")}
            </a>
          )}
          <Link href={manageUrl} className="text-center font-semibold text-site-accent underline">
            {t("confirmation.manageLink")}
          </Link>
        </div>
      </section>
    );
  }

  const offset = props.stepOffset ?? 0;
  const index = steps.indexOf(step) + offset;
  return (
    <div className="space-y-6">
      <p className="text-sm text-site-muted">
        {t("stepOf", { current: index + 1, total: steps.length + offset, label: stepLabels[step] })}
      </p>
      <ol className="flex gap-2" aria-label={t("title")}>
        {[...Array.from({ length: offset }, (_, i) => `avant-${i}`), ...steps].map((item, i) => (
          <li
            key={item}
            aria-current={item === step ? "step" : undefined}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-site-button" : "bg-site-border"}`}
          >
            <span className="sr-only">
              {item in stepLabels ? stepLabels[item as Step] : t("business.stepLabel")}
            </span>
          </li>
        ))}
      </ol>

      {/* ─── 1. Prestations ─── */}
      {step === "services" && (
        <section aria-labelledby="titre-etape" className="space-y-4">
          <h2
            id="titre-etape"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-heading"
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
                          {service.regularPriceCents ? (
                            <>
                              <s className="mr-2 text-sm font-normal text-site-muted">
                                {money(service.regularPriceCents, props.currency, props.locale)}
                              </s>
                              {money(service.priceCents, props.currency, props.locale)}
                            </>
                          ) : (
                            money(service.priceCents, props.currency, props.locale)
                          )}
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
          {props.previousHref && (
            <Link href={props.previousHref} className="inline-block font-semibold text-site-accent underline">
              ← {t("back")}
            </Link>
          )}
        </section>
      )}

      {/* ─── 2. Créneau ─── */}
      {step === "slot" && (
        <section aria-labelledby="titre-etape" className="space-y-4">
          <h2
            id="titre-etape"
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-heading"
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
            initialStaffId={props.preselectedStaffId ?? null}
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
            className="scroll-mt-28 font-site-display text-3xl font-semibold text-site-heading"
          >
            {t("details.title")}
          </h2>
          <div className="rounded-site bg-site-panel p-4">
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
            {promo && (
              <p className="mt-1 text-site-muted">
                {t("details.discount")} : − {money(promo.discountCents, props.currency, props.locale)}
              </p>
            )}
            <p className="mt-1 font-semibold">
              {t("details.total")} : {money(finalTotalCents, props.currency, props.locale)}
            </p>
            {depositCents > 0 && (
              <p className="font-semibold">
                {t("details.deposit")} : {money(depositCents, props.currency, props.locale)}
              </p>
            )}
          </div>
          {props.promoEnabled && (
            <div>
              <label htmlFor="b-promo" className="mb-2 block font-semibold text-site-text">
                {t("details.promo")}
              </label>
              {promo ? (
                <p className="flex flex-wrap items-center gap-3" role="status">
                  <span>
                    {t("details.promoApplied", {
                      code: promo.code,
                      amount: money(promo.discountCents, props.currency, props.locale),
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPromo(null);
                      setPromoCode("");
                    }}
                    className="font-semibold text-site-accent underline"
                  >
                    {t("details.promoRemove")}
                  </button>
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="b-promo"
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void applyPromo();
                      }
                    }}
                    maxLength={30}
                    autoComplete="off"
                    autoCapitalize="characters"
                    aria-describedby={promoError ? "b-promo-error" : undefined}
                    className={`${inputClass} min-w-0 flex-1 uppercase`}
                  />
                  <button
                    type="button"
                    onClick={() => void applyPromo()}
                    className="min-h-12 shrink-0 rounded-site border border-site-button px-4 font-semibold text-site-text"
                  >
                    {t("details.promoApply")}
                  </button>
                </div>
              )}
              {promoError && (
                <p id="b-promo-error" role="alert" className="mt-1 font-semibold text-site-text">
                  {tErrors(promoError as "invalid")}
                </p>
              )}
            </div>
          )}
          {props.giftCardsEnabled && (
            <div>
              <label htmlFor="b-gift" className="mb-2 block font-semibold text-site-text">
                {t("giftCard.label")}
              </label>
              {gift ? (
                <p className="flex flex-wrap items-center gap-3" role="status">
                  <span>
                    {gift.depositCents > 0
                      ? t("giftCard.applied", {
                          last4: gift.last4,
                          amount: money(gift.depositCents, props.currency, props.locale),
                          balance: money(gift.balanceCents, props.currency, props.locale),
                        })
                      : t("giftCard.appliedNoDeposit", {
                          last4: gift.last4,
                          balance: money(gift.balanceCents, props.currency, props.locale),
                        })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setGift(null);
                      setGiftCode("");
                    }}
                    className="font-semibold text-site-accent underline"
                  >
                    {t("giftCard.remove")}
                  </button>
                </p>
              ) : (
                <div className="flex gap-2">
                  <input
                    id="b-gift"
                    value={giftCode}
                    onChange={(event) => setGiftCode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void applyGiftCard();
                      }
                    }}
                    maxLength={40}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="XXXX-XXXX-XXXX"
                    aria-describedby={giftError ? "b-gift-error" : undefined}
                    className={`${inputClass} min-w-0 flex-1 uppercase`}
                  />
                  <button
                    type="button"
                    onClick={() => void applyGiftCard()}
                    className="min-h-12 shrink-0 rounded-site border border-site-button px-4 font-semibold text-site-text"
                  >
                    {t("giftCard.apply")}
                  </button>
                </div>
              )}
              {giftError && (
                <p id="b-gift-error" role="alert" className="mt-1 font-semibold text-site-text">
                  {tErrors(giftError as "invalid")}
                </p>
              )}
            </div>
          )}
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
              <Field
                name="firstName"
                label={t("details.firstName")}
                autoComplete="given-name"
                required
                defaultValue={props.prefill?.firstName}
              />
              <Field
                name="lastName"
                label={t("details.lastName")}
                autoComplete="family-name"
                defaultValue={props.prefill?.lastName}
              />
              <Field
                name="email"
                type="email"
                label={t("details.email")}
                hint={t("details.emailHint")}
                autoComplete="email"
                inputMode="email"
                required
                defaultValue={props.prefill?.email}
              />
              <Field
                name="phone"
                type="tel"
                label={t("details.phone")}
                hint={t("details.phoneHint")}
                autoComplete="tel"
                inputMode="tel"
                required
                defaultValue={props.prefill?.phone}
              />
            </div>
            <Field
              name="beneficiaryName"
              label={t("details.beneficiary")}
              hint={t("details.beneficiaryHint")}
              autoComplete="off"
            />
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
                : depositCents > 0 && !gift
                  ? t("details.confirmPay")
                  : t("details.confirm")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

/** Fichier d'agenda (.ics) du rendez-vous, à ouvrir avec l'agenda du téléphone. */
function calendarFile(event: { title: string; start: string; end: string; location: string }) {
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (value: string) => value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//rendez-vous//FR",
    "BEGIN:VEVENT",
    `UID:${stamp(event.start)}-${Math.random().toString(36).slice(2)}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${escape(event.title)}`,
    ...(event.location ? [`LOCATION:${escape(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

function Field({
  name,
  label,
  hint,
  type = "text",
  required,
  autoComplete,
  inputMode,
  defaultValue,
}: {
  defaultValue?: string;
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
        defaultValue={defaultValue}
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
