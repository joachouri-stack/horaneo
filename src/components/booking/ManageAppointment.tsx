"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import {
  cancelAction,
  getAvailabilityAction,
  rescheduleAction,
} from "@/app/(tenant)/sites/[tenantId]/reserver/actions";
import { formatLongDate, formatTimeOf, money } from "./format";
import { SlotPicker, type PickedSlot } from "./SlotPicker";

type Props = {
  token: string;
  /** Acompte payé qui sera remboursé en cas d'annulation (0 sinon). */
  refundableCents: number;
  currency: string;
  locale: string;
  timezone: string;
  canModify: boolean;
  serviceIds: string[];
  staffOptions: { id: string; name: string }[];
  managePath: string;
  bookingPath: string;
};

/** Boutons « Annuler » et « Déplacer » de la page de gestion d'un rendez-vous. */
export function ManageAppointment({
  token,
  refundableCents,
  currency,
  locale,
  timezone,
  canModify,
  serviceIds,
  staffOptions,
  managePath,
  bookingPath,
}: Props) {
  const t = useTranslations("booking.manage");
  const tErrors = useTranslations("errors");
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancelled" | "moved">("idle");
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [refunded, setRefunded] = useState(0);

  const loadDays = useCallback(
    (staffId: string | null, fromDate?: string) =>
      getAvailabilityAction({ serviceIds, staffId, fromDate, days: 14, manageToken: token }),
    [serviceIds, token],
  );

  const button = "inline-flex min-h-12 items-center justify-center rounded-site px-6 font-semibold";

  if (mode === "cancelled") {
    return (
      <div role="status" className="space-y-4">
        <p className="text-lg font-semibold">{t("cancelled")}</p>
        {refunded > 0 && <p>{t("refunded", { amount: money(refunded, currency, locale) })}</p>}
        <Link href={bookingPath} className={`${button} bg-site-button text-site-on-button`}>
          {t("rebook")}
        </Link>
      </div>
    );
  }
  if (mode === "moved" && newToken) {
    return (
      <div role="status" className="space-y-4">
        <p className="text-lg font-semibold">{t("rescheduled")}</p>
        <Link href={`${managePath}/${newToken}`} className={`${button} bg-site-button text-site-on-button`}>
          {t("title")}
        </Link>
      </div>
    );
  }
  if (!canModify) return null;

  return (
    <div className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-site border border-site-border bg-site-surface px-4 py-3 font-semibold"
        >
          {tErrors(error as "invalid")}
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
            disabled={pending}
            onClick={async () => {
              if (!window.confirm(t("cancelConfirm"))) return;
              setPending(true);
              const result = await cancelAction(token);
              setPending(false);
              if (result.ok) {
                setRefunded(result.data.refundedCents);
                setMode("cancelled");
              } else setError(result.error);
            }}
            className={`${button} border border-site-border text-site-text`}
          >
            {t("cancel")}
          </button>
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
            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const result = await rescheduleAction({
                  token,
                  start: picked.start,
                  staffId: picked.staffId,
                });
                setPending(false);
                if (result.ok) {
                  setNewToken(result.data.manageToken);
                  setMode("moved");
                } else setError(result.error);
              }}
              className={`${button} w-full bg-site-button text-site-on-button sm:w-auto`}
            >
              {t("rescheduleConfirm")} : {formatLongDate(picked.start, locale, timezone)},{" "}
              {formatTimeOf(picked.start, locale, timezone)}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
