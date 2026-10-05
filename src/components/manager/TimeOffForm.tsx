"use client";

import { useLocale, useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef } from "react";
import { createTimeOffAction } from "@/app/(platform)/[locale]/espace/[tenantId]/actions";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions/result";

type Props = {
  tenantId: string;
  kind: "block" | "leave" | "closure";
  staff: { id: string; name: string }[];
  today: string;
  timeZone: string;
};

/** Bloquer un créneau, poser un congé ou fermer l'établissement ; signale les rendez-vous déjà pris. */
export function TimeOffForm({ tenantId, kind, staff, today, timeZone }: Props) {
  const t = useTranslations("manager.unavailability");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(createTimeOffAction, null as ActionResult<unknown> | null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  const conflictList = state?.ok
    ? ((state.data as { conflicts: { id: string; startsAt: Date | string }[] } | undefined)?.conflicts ?? [])
    : [];
  const conflicts = conflictList.length;
  const when = new Intl.DateTimeFormat(useLocale(), {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const field = (name: string, label: string, type: string, defaultValue?: string) => (
    <div>
      <label htmlFor={`to-${name}`} className={ui.label}>
        {label}
      </label>
      <input
        id={`to-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required
        className={ui.input}
      />
    </div>
  );

  return (
    <form
      ref={formRef}
      // Envoi manuel : la saisie reste en place si le serveur signale une erreur
      // (l'envoi natif de React viderait le formulaire).
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="kind" value={kind} />
      {kind !== "closure" && (
        <div>
          <label htmlFor="to-staff" className={ui.label}>
            {t("staff")}
          </label>
          <select id="to-staff" name="staffId" className={ui.input} required>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {kind === "block" ? (
        // Date sur toute la largeur, puis De / À : les champs restent lisibles sur téléphone.
        <div className="grid grid-cols-2 gap-3 [&>div:first-child]:col-span-2 sm:grid-cols-3 sm:[&>div:first-child]:col-span-1">
          {field("date", t("date"), "date", today)}
          {field("from", t("from"), "time", "12:00")}
          {field("to", t("to"), "time", "13:00")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {field("startDate", t("startDate"), "date", today)}
          {field("endDate", t("endDate"), "date", today)}
        </div>
      )}
      <div>
        <label htmlFor="to-reason" className={ui.label}>
          {t("reason")}
        </label>
        <input id="to-reason" name="reason" className={ui.input} />
      </div>
      {state && !state.ok && (
        <p role="alert" className={ui.error}>
          {tErrors(state.error)}
        </p>
      )}
      {state?.ok && (
        <div role="status" className={conflicts > 0 ? ui.error : ui.success}>
          <p>{conflicts > 0 ? t("conflicts", { count: conflicts }) : tCommon("saved")}</p>
          {conflicts > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {conflictList.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/espace/${tenantId}/rendez-vous/${item.id}`}
                    className="font-semibold underline"
                  >
                    {when.format(new Date(item.startsAt))}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="submit" disabled={pending} className={`${ui.primaryButton} sm:w-auto`}>
        {t("save")}
      </button>
    </form>
  );
}
