"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { createTimeOffAction } from "@/app/(platform)/[locale]/espace/[tenantId]/actions";
import { ui } from "@/components/ui/styles";
import type { ActionResult } from "@/lib/actions/result";

type Props = {
  tenantId: string;
  kind: "block" | "leave" | "closure";
  staff: { id: string; name: string }[];
  today: string;
};

/** Bloquer un créneau, poser un congé ou fermer l'établissement ; signale les rendez-vous déjà pris. */
export function TimeOffForm({ tenantId, kind, staff, today }: Props) {
  const t = useTranslations("manager.unavailability");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(createTimeOffAction, null as ActionResult<unknown> | null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  const conflicts = state?.ok
    ? ((state.data as { conflicts: unknown[] } | undefined)?.conflicts.length ?? 0)
    : 0;
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
    <form ref={formRef} action={action} className="space-y-4">
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
        <div className="grid grid-cols-3 gap-3">
          {field("date", t("date"), "date", today)}
          {field("from", t("from"), "time", "12:00")}
          {field("to", t("to"), "time", "13:00")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
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
        <p role="status" className={conflicts > 0 ? ui.error : ui.success}>
          {conflicts > 0 ? t("conflicts", { count: conflicts }) : tCommon("saved")}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${ui.primaryButton} sm:w-auto`}>
        {t("save")}
      </button>
    </form>
  );
}
