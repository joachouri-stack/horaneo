"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelAction,
  getAvailabilityAction,
  rescheduleAction,
} from "@/app/(tenant)/sites/[tenantId]/reserver/actions";
import { formatLongDate, formatTimeOf, money } from "./format";
import { useSiteError } from "./hooks";
import { SlotPicker, type PickedSlot } from "./SlotPicker";

type Props = {
  token: string;
  /** Début du rendez-vous (rappelé dans la confirmation d'annulation). */
  startsAt: string;
  /** Acompte payé qui sera remboursé en cas d'annulation (0 sinon). */
  refundableCents: number;
  /** Acompte réglé avec une carte cadeau : remis sur la carte en cas d'annulation. */
  giftCardDeposit?: boolean;
  currency: string;
  locale: string;
  timezone: string;
  canModify: boolean;
  serviceIds: string[];
  staffOptions: { id: string; name: string }[];
  managePath: string;
};

/**
 * Boutons « Annuler » et « Déplacer » de la page de gestion d'un rendez-vous.
 * Après l'un ou l'autre, la page est rechargée : elle montre l'état à jour en haut.
 */
export function ManageAppointment({
  token,
  startsAt,
  refundableCents,
  giftCardDeposit,
  currency,
  locale,
  timezone,
  canModify,
  serviceIds,
  staffOptions,
  managePath,
}: Props) {
  const t = useTranslations("booking.manage");
  const siteError = useSiteError();
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "confirmCancel" | "reschedule">("idle");
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLDivElement>(null);

  const loadDays = useCallback(
    (staffId: string | null, fromDate?: string) =>
      getAvailabilityAction({ serviceIds, staffId, fromDate, days: 14, manageToken: token }),
    [serviceIds, token],
  );

  // Créneau choisi : le bouton de confirmation est amené à l'écran (sinon la cliente croit avoir fini).
  useEffect(() => {
    if (picked) confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [picked]);

  useEffect(() => {
    if (mode === "confirmCancel") {
      cancelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      cancelRef.current?.focus({ preventScroll: true });
    }
  }, [mode]);

  const button = "inline-flex min-h-12 items-center justify-center rounded-site px-6 font-semibold";
  if (!canModify) return null;

  async function cancel() {
    setPending(true);
    setError(null);
    const result = await cancelAction(token);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    // La page relue affiche « annulé » en haut, avec le remboursement éventuel.
    router.replace(`${managePath}/${token}?fait=annule`);
  }

  async function reschedule(slot: PickedSlot) {
    setPending(true);
    setError(null);
    const result = await rescheduleAction({ token, start: slot.start, staffId: slot.staffId });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.replace(`${managePath}/${token}?fait=deplace`);
  }

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-site border border-site-border bg-site-surface px-4 py-3 font-semibold"
        >
          {siteError(error)}
        </p>
      )}
      {mode === "idle" && refundableCents > 0 && (
        <p className="text-site-muted">
          {t("refundInfo", { amount: money(refundableCents, currency, locale) })}
        </p>
      )}
      {mode === "idle" && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setMode("reschedule")}
            className={`${button} bg-site-button text-site-on-button`}
          >
            {t("reschedule")}
          </button>
          <button
            type="button"
            onClick={() => setMode("confirmCancel")}
            className={`${button} border border-site-border text-site-text`}
          >
            {t("cancel")}
          </button>
        </div>
      )}
      {mode === "confirmCancel" && (
        <div
          ref={cancelRef}
          tabIndex={-1}
          role="alertdialog"
          aria-labelledby="annuler-titre"
          className="space-y-3 rounded-site border-2 border-site-button bg-site-panel p-5 focus:outline-none"
        >
          <p id="annuler-titre" className="text-lg font-semibold">
            {t("cancelConfirm", {
              date: formatLongDate(startsAt, locale, timezone),
              time: formatTimeOf(startsAt, locale, timezone),
            })}
          </p>
          <p>{t("cancelFree")}</p>
          {refundableCents > 0 && (
            <p>{t("cancelRefund", { amount: money(refundableCents, currency, locale) })}</p>
          )}
          {giftCardDeposit && <p>{t("cancelGiftCard")}</p>}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={() => void cancel()}
              className={`${button} bg-site-button text-site-on-button disabled:opacity-50`}
            >
              {t("cancelYes")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode("idle")}
              className={`${button} border border-site-border text-site-text`}
            >
              {t("cancelNo")}
            </button>
          </div>
        </div>
      )}
      {mode === "reschedule" && (
        <section aria-labelledby="report" className="space-y-4">
          <h2 id="report" className="font-site-display text-2xl font-semibold text-site-heading">
            {t("rescheduleTitle")}
          </h2>
          <SlotPicker
            locale={locale}
            staffOptions={staffOptions}
            loadDays={loadDays}
            onPick={setPicked}
            onError={setError}
            selected={picked}
          />
          {picked && (
            // Collé en bas de l'écran : toujours visible une fois l'heure choisie.
            <div
              ref={confirmRef}
              className="sticky bottom-3 z-10 scroll-mb-3 rounded-site border border-site-border bg-site-bg p-3 shadow-lg sm:bottom-4"
            >
              <button
                type="button"
                disabled={pending}
                onClick={() => void reschedule(picked)}
                className={`${button} w-full bg-site-button text-site-on-button disabled:opacity-50`}
              >
                {t("rescheduleConfirm", {
                  date: formatLongDate(picked.start, locale, timezone),
                  time: formatTimeOf(picked.start, locale, timezone),
                })}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
