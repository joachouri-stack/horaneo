"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState } from "react";
import { setAttendanceAction } from "@/app/(platform)/[locale]/espace/[tenantId]/actions";

/**
 * Pointage d'un rendez-vous passé depuis l'agenda du jour : « Venue » ou « Absente »
 * en un geste, sans ouvrir la fiche. La page se met à jour après l'enregistrement.
 */
export function AttendanceButtons({ tenantId, appointmentId }: { tenantId: string; appointmentId: string }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(setAttendanceAction, null);
  const send = (status: "attended" | "no_show") => {
    if (status === "no_show" && !window.confirm(t("manager.appointment.noShowConfirm"))) return;
    const data = new FormData();
    data.set("tenantId", tenantId);
    data.set("id", appointmentId);
    data.set("status", status);
    startTransition(() => action(data));
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <span className="col-span-2 text-sm text-ink-soft">{t("manager.today.checkIn")}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => send("attended")}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#e7f6ee] px-4 text-[0.95rem] font-medium text-[#1e7a4c] transition hover:bg-[#d6efe2] disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
        {t("manager.appointment.attended")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => send("no_show")}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e6b8b2] bg-white px-4 text-[0.95rem] font-medium text-[#b4372a] transition hover:bg-[#fdf1ef] disabled:opacity-60"
      >
        {t("manager.appointment.noShow")}
      </button>
      {state && !state.ok && (
        <p role="alert" className="col-span-2 text-sm text-[#b4372a]">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </div>
  );
}
