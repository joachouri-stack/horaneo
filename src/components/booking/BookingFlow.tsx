"use client";

import { appointmentEvent, googleCalendarUrl } from "@/lib/calendar/appointment";
import { birthMonthNames } from "@/modules/customers/birthday";
import { appointmentCalendarPath } from "@/modules/site/paths";
import dynamic from "next/dynamic";
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
import { endTimeOf, formatLongDate, formatTimeOf, money } from "./format";
import { useDurations, useSiteError } from "./hooks";
import { SlotPicker, type PickedSlot } from "./SlotPicker";

// Formulaire de carte (Stripe) : chargé seulement quand un acompte est à payer.
const DepositPayment = dynamic(() => import("./DepositPayment").then((module) => module.DepositPayment), {
  ssr: false,
});

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
  /** « Réserver à nouveau » : praticienne déjà choisie et passage direct au choix du créneau. */
  preselectedStaffId?: string | null;
  startAtSlot?: boolean;
  /** Cliente connectée à son espace : coordonnées déjà remplies. */
  prefill?: { firstName: string; lastName: string; email: string; phone: string } | null;
  /** Carte cadeau choisie depuis l'espace des clientes. */
  initialGiftCode?: string;
  deposit: { enabled: boolean; type: "percent" | "fixed"; value: number };
  promoEnabled: boolean;
  /** Offre d'anniversaire de l'entreprise : date d'anniversaire demandée (facultative). */
  birthdayEnabled?: boolean;
  /** Pack avec cartes cadeaux : la carte peut remplacer l'acompte. */
  giftCardsEnabled?: boolean;
  /** Rappel par SMS la veille (pack avec SMS) : mentionné sous le téléphone. */
  smsReminders?: boolean;
  holdMinutes: number;
  cancellationHours: number;
  /** Réservation possible jusqu'à N jours à l'avance. */
  maxAdvanceDays?: number;
  privacyPath: string;
  /** Page des conditions d'annulation, citée dans le récapitulatif. */
  conditionsPath?: string;
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
  /** Proposition d'installer l'application, montrée après une réservation confirmée. */
  afterBooking?: React.ReactNode;
};

type Step = "services" | "slot" | "details" | "done";

const CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "note",
  "beneficiaryName",
  "birthDay",
] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];
type Contact = Record<ContactField, string> & {
  marketingConsent: boolean;
  website: string;
  birthMonth: string;
};

const inputClass =
  "block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 py-3 text-lg text-site-text aria-[invalid=true]:border-2 aria-[invalid=true]:border-site-accent";
const primaryClass =
  "inline-flex min-h-14 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button disabled:opacity-50 sm:w-auto";
const linkClass = "inline-flex min-h-11 items-center font-semibold text-site-accent underline";
const headingClass =
  "scroll-mt-28 font-site-display text-3xl font-semibold text-site-heading focus:outline-none";

/** Le délai d'annulation gratuite est-il déjà passé ? (calculé hors du rendu de React) */
function isPast(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}

/**
 * Parcours de réservation en 4 étapes, sans compte : prestation, créneau,
 * coordonnées, puis acompte si l'établissement l'a activé.
 */
export function BookingFlow(props: Props) {
  const t = useTranslations("booking");
  const siteError = useSiteError();
  const { duration, withDuration } = useDurations();
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    props.preselectedServiceId && props.startAtSlot ? "slot" : "services",
  );
  const [selected, setSelected] = useState<string[]>(
    props.preselectedServiceId ? [props.preselectedServiceId] : [],
  );
  const [slot, setSlot] = useState<PickedSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: ContactField; code: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [promo, setPromo] = useState<PromoPreview | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [giftOpen, setGiftOpen] = useState(Boolean(props.initialGiftCode));
  const [giftCode, setGiftCode] = useState(props.initialGiftCode ?? "");
  const [gift, setGift] = useState<GiftPreview | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  // Champs contrôlés : rien n'est effacé si le serveur refuse la réservation.
  const [contact, setContact] = useState<Contact>({
    firstName: props.prefill?.firstName ?? "",
    lastName: props.prefill?.lastName ?? "",
    email: props.prefill?.email ?? "",
    phone: props.prefill?.phone ?? "",
    note: "",
    beneficiaryName: "",
    birthDay: "",
    birthMonth: "",
    marketingConsent: false,
    website: "",
  });
  const headingRef = useRef<HTMLHeadingElement>(null);

  // À chaque étape, le titre reçoit le focus (lecteurs d'écran, navigation au clavier).
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Champ refusé par le serveur : on l'amène à l'écran et on y place le curseur.
  useEffect(() => {
    if (!fieldError) return;
    const input = document.getElementById(`b-${fieldError.field}`);
    input?.scrollIntoView({ block: "center", behavior: "smooth" });
    input?.focus({ preventScroll: true });
  }, [fieldError]);

  const chosen = props.services.filter((service) => selected.includes(service.id));
  const anyPriceFrom = chosen.some((service) => service.priceFrom);
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
  const price = (cents: number, from = false) => {
    const amount = money(cents, props.currency, props.locale);
    return from ? t("priceFrom", { price: amount }) : amount;
  };
  const chosenNames = chosen
    .map((service) => withDuration(service.name, service.durationMinutes))
    .join(" + ");

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

  const update = (field: keyof Contact, value: string | boolean) => {
    setContact((current) => ({ ...current, [field]: value }));
    // Le jour et le mois de l'anniversaire forment un seul champ (erreur portée par le jour).
    const errorField = field === "birthMonth" ? "birthDay" : field;
    if (fieldError?.field === errorField) setFieldError(null);
  };

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

  /** Délai de paiement dépassé : on repart du choix du créneau, prestations gardées. */
  function restart() {
    setConfirmation(null);
    setSlot(null);
    setError(null);
    setStep("slot");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    // Envoi géré ici (et non par l'action du formulaire) : React ne vide pas les champs.
    event.preventDefault();
    if (!slot || pending) return;
    setPending(true);
    setError(null);
    setFieldError(null);
    const result = await bookAction({
      serviceIds: selected,
      staffId: slot.staffId,
      start: slot.start,
      promoCode: promo?.code,
      giftCardCode: gift ? giftCode : undefined,
      website: contact.website,
      customer: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        note: contact.note,
        beneficiaryName: contact.beneficiaryName,
        marketingConsent: contact.marketingConsent,
        // Anniversaire : seulement si l'entreprise le demande, jour et mois choisis.
        ...(props.birthdayEnabled && (contact.birthDay || contact.birthMonth)
          ? { birthDay: Number(contact.birthDay) || 0, birthMonth: Number(contact.birthMonth) || 0 }
          : {}),
      },
    });
    setPending(false);
    if (!result.ok) {
      const field = result.field?.replace(/^customer\./, "") as ContactField | undefined;
      if (field && CONTACT_FIELDS.includes(field)) {
        setFieldError({ field, code: result.error });
        return;
      }
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

  const fieldLabels: Record<ContactField, string> = {
    firstName: t("details.firstName"),
    lastName: t("details.lastName"),
    email: t("details.email"),
    phone: t("details.phone"),
    note: t("details.note"),
    beneficiaryName: t("details.beneficiary"),
    birthDay: t("details.birthday"),
  };
  const fieldMessage = (field: ContactField) => {
    if (fieldError?.field !== field) return undefined;
    return fieldError.code === "invalid" ? t(`details.fieldErrors.${field}`) : siteError(fieldError.code);
  };

  const errorBox = error && (
    <p
      role="alert"
      className="rounded-site border border-site-border bg-site-surface px-4 py-3 font-semibold text-site-text"
    >
      {siteError(error)}
    </p>
  );

  // ─── Confirmation ──────────────────────────────────────────────────────────
  if (step === "done" && confirmation) {
    const pendingPayment = confirmation.status === "pending_payment";
    const manageUrl = `${props.managePath}/${confirmation.manageToken}`;
    const remainingCents = Math.max(0, confirmation.totalCents - confirmation.depositCents);
    return (
      <section aria-labelledby="titre-etape" className="rounded-site bg-site-panel p-6 sm:p-8">
        <h2 id="titre-etape" ref={headingRef} tabIndex={-1} className={headingClass}>
          {pendingPayment ? t("confirmation.pendingTitle") : t("confirmation.title")}
        </h2>
        {!pendingPayment && (
          <div className="mt-6 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-site-button text-site-on-button">
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
          <p className="font-semibold">{chosenNames}</p>
          <p className="text-site-muted">
            {t("confirmation.summary", {
              date: formatLongDate(confirmation.startsAt, props.locale, props.timezone),
              time: formatTimeOf(confirmation.startsAt, props.locale, props.timezone),
              name: confirmation.staffName,
            })}
          </p>
          <p className="text-site-muted">
            {t("details.totalDuration", {
              duration: duration(totalMinutes),
              time: formatTimeOf(confirmation.endsAt, props.locale, props.timezone),
            })}
          </p>
        </div>
        <p className="mt-2 font-semibold">
          {t(anyPriceFrom ? "details.totalFrom" : "details.total", {
            amount: money(confirmation.totalCents, confirmation.currency, props.locale),
          })}
        </p>
        {confirmation.paidWithGiftCard && <p className="text-site-muted">{t("giftCard.paidWith")}</p>}
        {confirmation.discountCents > 0 && (
          <p className="text-site-muted">
            {t("details.discount", {
              amount: money(confirmation.discountCents, confirmation.currency, props.locale),
            })}
          </p>
        )}
        {confirmation.depositCents > 0 && (
          <p className="text-site-muted">
            {t(anyPriceFrom ? "details.remainingFrom" : "details.remaining", {
              amount: money(remainingCents, confirmation.currency, props.locale),
            })}
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
              <DepositPayment
                checkout={confirmation.payment}
                amountCents={confirmation.depositCents}
                currency={confirmation.currency}
                locale={props.locale}
                holdExpiresAt={confirmation.holdExpiresAt}
                returnPath={manageUrl}
                onPaid={paid}
                onRestart={restart}
                labels={
                  props.payeeName ? { secure: t("payment.secureTo", { name: props.payeeName }) } : undefined
                }
              />
            ) : (
              <p>{t("payment.unavailable")}</p>
            )}
          </div>
        )}
        {props.address && <p className="mt-3 text-sm text-site-muted">{props.address}</p>}
        <p className="mt-6">{t("confirmation.keepLink", { hours: props.cancellationHours })}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {!pendingPayment && (
            <>
              <a href={appointmentCalendarPath(confirmation.manageToken)} className={primaryClass}>
                {t("confirmation.addToCalendar")}
              </a>
              <a
                href={googleCalendarUrl(
                  appointmentEvent({
                    id: confirmation.manageToken,
                    start: new Date(confirmation.startsAt),
                    end: new Date(confirmation.endsAt),
                    services: chosen.map((service) => service.name),
                    businessName: props.siteName ?? "",
                    address: props.address,
                    manageUrl: `${window.location.origin}${manageUrl}`,
                    host: window.location.host,
                  }),
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkClass} justify-center text-center`}
              >
                {t("confirmation.googleCalendar")}
              </a>
            </>
          )}
          <Link href={manageUrl} className={`${linkClass} justify-center text-center`}>
            {t("confirmation.manageLink")}
          </Link>
        </div>
        {!pendingPayment && props.afterBooking}
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
          <h2 id="titre-etape" ref={headingRef} tabIndex={-1} className={headingClass}>
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
                              {price(service.priceCents, service.priceFrom)}
                            </>
                          ) : (
                            price(service.priceCents, service.priceFrom)
                          )}
                        </span>
                        <span className="block text-sm text-site-muted">
                          {duration(service.durationMinutes)}
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
          {/* Récapitulatif collé en bas de l'écran, seulement une fois une prestation choisie. */}
          {chosen.length > 0 && (
            <div className="sticky bottom-3 z-10 rounded-site border border-site-border bg-site-bg p-4 shadow-lg sm:bottom-4">
              <p className="mb-3 text-site-text" aria-live="polite">
                {t("services.selected", {
                  count: chosen.length,
                  duration: duration(totalMinutes),
                  price: price(totalCents, anyPriceFrom),
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
          )}
          {props.previousHref && (
            <Link href={props.previousHref} className={linkClass}>
              ← {t("back")}
            </Link>
          )}
        </section>
      )}

      {/* ─── 2. Créneau ─── */}
      {step === "slot" && (
        <section aria-labelledby="titre-etape" className="space-y-4">
          <h2 id="titre-etape" ref={headingRef} tabIndex={-1} className={headingClass}>
            {t("steps.slot")}
          </h2>
          <p className="text-site-muted">
            {/* Une seule prestation : sa durée est déjà dans son nom. */}
            {chosenNames}
            {chosen.length > 1 && <> · {duration(totalMinutes)}</>}{" "}
            <button type="button" onClick={() => setStep("services")} className={linkClass}>
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
            maxAdvanceDays={props.maxAdvanceDays}
            onError={setError}
            onPick={(picked) => {
              setError(null);
              setSlot(picked);
              setStep("details");
            }}
          />
          <button type="button" onClick={() => setStep("services")} className={linkClass}>
            ← {t("back")}
          </button>
        </section>
      )}

      {/* ─── 3. Coordonnées ─── */}
      {step === "details" && slot && (
        <section aria-labelledby="titre-etape" className="space-y-6">
          <h2 id="titre-etape" ref={headingRef} tabIndex={-1} className={headingClass}>
            {t("details.title")}
          </h2>
          <Summary
            slot={slot}
            props={props}
            chosen={chosen}
            totalMinutes={totalMinutes}
            finalTotalCents={finalTotalCents}
            depositCents={depositCents}
            anyPriceFrom={anyPriceFrom}
            promo={promo}
            price={price}
            onChangeSlot={() => setStep("slot")}
          />
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
                    className={linkClass}
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
                  {siteError(promoError)}
                </p>
              )}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            {/* Champ piège pour les robots : invisible pour les personnes. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                Website
                <input
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={contact.website}
                  onChange={(event) => update("website", event.target.value)}
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="firstName"
                label={fieldLabels.firstName}
                autoComplete="given-name"
                required
                value={contact.firstName}
                onChange={(value) => update("firstName", value)}
                error={fieldMessage("firstName")}
              />
              <Field
                name="lastName"
                label={fieldLabels.lastName}
                autoComplete="family-name"
                value={contact.lastName}
                onChange={(value) => update("lastName", value)}
                error={fieldMessage("lastName")}
              />
              <Field
                name="email"
                type="email"
                label={fieldLabels.email}
                hint={t("details.emailHint")}
                autoComplete="email"
                inputMode="email"
                required
                value={contact.email}
                onChange={(value) => update("email", value)}
                error={fieldMessage("email")}
              />
              <Field
                name="phone"
                type="tel"
                label={fieldLabels.phone}
                hint={props.smsReminders ? t("details.phoneHintSms") : t("details.phoneHint")}
                autoComplete="tel"
                inputMode="tel"
                required
                value={contact.phone}
                onChange={(value) => update("phone", value)}
                error={fieldMessage("phone")}
              />
            </div>
            {props.birthdayEnabled && (
              <fieldset aria-describedby="b-birthday-hint">
                <legend className="mb-2 block font-semibold text-site-text">{t("details.birthday")}</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                  <div>
                    <label htmlFor="b-birthDay" className="sr-only">
                      {t("details.birthdayDay")}
                    </label>
                    <select
                      id="b-birthDay"
                      name="birthDay"
                      value={contact.birthDay}
                      onChange={(event) => update("birthDay", event.target.value)}
                      aria-invalid={fieldError?.field === "birthDay" || undefined}
                      className={`${inputClass} scroll-mt-28`}
                    >
                      <option value="">{t("details.birthdayDay")}</option>
                      {Array.from({ length: 31 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="b-birthMonth" className="sr-only">
                      {t("details.birthdayMonth")}
                    </label>
                    <select
                      id="b-birthMonth"
                      name="birthMonth"
                      value={contact.birthMonth}
                      onChange={(event) => update("birthMonth", event.target.value)}
                      aria-invalid={fieldError?.field === "birthDay" || undefined}
                      className={inputClass}
                    >
                      <option value="">{t("details.birthdayMonth")}</option>
                      {birthMonthNames(props.locale).map((item) => (
                        <option key={item.month} value={String(item.month)}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {fieldError?.field === "birthDay" && (
                  <p className="mt-1 font-semibold text-site-text">{fieldMessage("birthDay")}</p>
                )}
                <p id="b-birthday-hint" className="mt-1 text-sm text-site-muted">
                  {t("details.birthdayHint")}
                </p>
              </fieldset>
            )}
            {props.giftCardsEnabled && (
              <div>
                {!giftOpen && !gift ? (
                  <button
                    type="button"
                    aria-expanded={false}
                    onClick={() => setGiftOpen(true)}
                    className={linkClass}
                  >
                    {t("giftCard.toggle")}
                  </button>
                ) : (
                  <>
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
                          className={linkClass}
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
                        {siteError(giftError)}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <Field
              name="beneficiaryName"
              label={fieldLabels.beneficiaryName}
              hint={t("details.beneficiaryHint")}
              autoComplete="off"
              value={contact.beneficiaryName}
              onChange={(value) => update("beneficiaryName", value)}
              error={fieldMessage("beneficiaryName")}
            />
            <div>
              <label htmlFor="b-note" className="mb-2 block font-semibold text-site-text">
                {t("details.note")}
              </label>
              <textarea
                id="b-note"
                name="note"
                rows={2}
                maxLength={500}
                value={contact.note}
                onChange={(event) => update("note", event.target.value)}
                aria-invalid={fieldError?.field === "note" || undefined}
                aria-describedby={fieldError?.field === "note" ? "b-note-error" : undefined}
                className={inputClass}
              />
              {fieldError?.field === "note" && (
                <p id="b-note-error" className="mt-1 font-semibold text-site-text">
                  {fieldMessage("note")}
                </p>
              )}
            </div>
            <label className="flex items-start gap-3 text-site-text">
              <input
                type="checkbox"
                name="marketingConsent"
                checked={contact.marketingConsent}
                onChange={(event) => update("marketingConsent", event.target.checked)}
                className="mt-1 h-5 w-5 accent-[var(--site-button)]"
              />
              <span>{t("details.marketingConsent")}</span>
            </label>
            <p className="text-sm text-site-muted">
              {t("details.privacy")}{" "}
              <Link href={props.privacyPath} className="inline-flex min-h-11 items-center underline">
                {t("details.privacyLink")}
              </Link>
            </p>
            {/* Rappel de l'erreur juste au-dessus du bouton, là où se trouve la cliente. */}
            {fieldError && (
              <p
                role="alert"
                className="rounded-site border border-site-border bg-site-surface px-4 py-3 font-semibold text-site-text"
              >
                {t("details.fixField", { field: fieldLabels[fieldError.field] })}{" "}
                <span className="font-normal">{fieldMessage(fieldError.field)}</span>
              </p>
            )}
            {errorBox}
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

/** Récapitulatif avant de confirmer : prestations, durée, prix, acompte et conditions d'annulation. */
function Summary({
  slot,
  props,
  chosen,
  totalMinutes,
  finalTotalCents,
  depositCents,
  anyPriceFrom,
  promo,
  price,
  onChangeSlot,
}: {
  slot: PickedSlot;
  props: Props;
  chosen: FlowService[];
  totalMinutes: number;
  finalTotalCents: number;
  depositCents: number;
  anyPriceFrom: boolean;
  promo: PromoPreview | null;
  price: (cents: number, from?: boolean) => string;
  onChangeSlot: () => void;
}) {
  const t = useTranslations("booking");
  const { duration, withDuration } = useDurations();
  const { locale, timezone, currency, cancellationHours } = props;
  const deadline = new Date(new Date(slot.start).getTime() - cancellationHours * 3_600_000).toISOString();
  const cancellation =
    cancellationHours === 0
      ? t("details.freeUntilStart")
      : isPast(deadline)
        ? t("details.noFreeCancel", { hours: cancellationHours })
        : t("details.freeUntil", {
            date: formatLongDate(deadline, locale, timezone),
            time: formatTimeOf(deadline, locale, timezone),
          });
  const staffName = slot.staffId ? props.staff.find((member) => member.id === slot.staffId)?.name : null;

  return (
    <div className="rounded-site bg-site-panel p-4">
      <h3 className="font-semibold">{t("details.summary")}</h3>
      <p className="mt-1">
        {t("slot.chosen", {
          date: formatLongDate(slot.start, locale, timezone),
          time: formatTimeOf(slot.start, locale, timezone),
        })}
        {staffName && ` ${t("details.with", { name: staffName })}`}{" "}
        <button
          type="button"
          onClick={onChangeSlot}
          className="inline-flex min-h-11 items-center font-semibold text-site-accent underline"
        >
          {t("change")}
        </button>
      </p>
      <ul className="text-site-muted">
        {chosen.map((service) => (
          <li key={service.id} className="flex justify-between gap-3">
            <span>{withDuration(service.name, service.durationMinutes)}</span>
            <span className="shrink-0">{price(service.priceCents, service.priceFrom)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-site-muted">
        {t("details.totalDuration", {
          duration: duration(totalMinutes),
          time: endTimeOf(slot.start, totalMinutes, locale, timezone),
        })}
      </p>
      {promo && (
        <p className="mt-1 text-site-muted">
          {t("details.discount", { amount: money(promo.discountCents, currency, locale) })}
        </p>
      )}
      <p className="mt-1 font-semibold">
        {t(anyPriceFrom ? "details.totalFrom" : "details.total", {
          amount: money(finalTotalCents, currency, locale),
        })}
      </p>
      {depositCents > 0 ? (
        <>
          <p className="font-semibold">
            {t("details.deposit", { amount: money(depositCents, currency, locale) })}
          </p>
          <p className="text-site-muted">
            {t(anyPriceFrom ? "details.remainingFrom" : "details.remaining", {
              amount: money(Math.max(0, finalTotalCents - depositCents), currency, locale),
            })}
          </p>
          <p className="mt-2 text-sm text-site-muted">
            {t("details.depositRule", { hours: cancellationHours })}
          </p>
        </>
      ) : (
        <p className="text-site-muted">{t("details.payOnSite")}</p>
      )}
      <p className="mt-2 text-sm text-site-muted">
        {cancellation}{" "}
        {props.conditionsPath && (
          <Link href={props.conditionsPath} className="inline-flex min-h-11 items-center underline">
            {t("details.conditionsLink")}
          </Link>
        )}
      </p>
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
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  inputMode?: "email" | "tel";
  value: string;
  onChange: (value: string) => void;
  /** Message du serveur pour ce champ : affiché dessous, champ signalé. */
  error?: string;
}) {
  const describedBy = [error ? `b-${name}-error` : null, hint ? `b-${name}-hint` : null]
    .filter(Boolean)
    .join(" ");
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`${inputClass} scroll-mt-28`}
      />
      {error && (
        <p id={`b-${name}-error`} className="mt-1 font-semibold text-site-text">
          {error}
        </p>
      )}
      {hint && (
        <p id={`b-${name}-hint`} className="mt-1 text-sm text-site-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
