"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { saveBirthdayAction } from "@/app/(tenant)/sites/[tenantId]/mes-rendez-vous/actions";
import { birthMonthNames } from "@/modules/customers/birthday";

const selectClass =
  "block min-h-12 w-full rounded-site border border-site-border bg-site-bg px-4 py-3 text-lg text-site-text";

/**
 * Anniversaire de la cliente (jour et mois), donné une seule fois et enregistré
 * dans chaque entreprise du site où elle est connue.
 */
export function BirthdayForm({
  businessIds,
  locale,
  month,
  day,
}: {
  businessIds: string[];
  locale: string;
  month: number | null;
  day: number | null;
}) {
  const t = useTranslations("site.account");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(saveBirthdayAction, null);
  const id = "anniversaire";
  return (
    <form action={action} className="space-y-3">
      {businessIds.map((businessId) => (
        <input key={businessId} type="hidden" name="businessId" value={businessId} />
      ))}
      <fieldset>
        <legend className="sr-only">{t("birthdayTitle")}</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
          <div>
            <label htmlFor={`${id}-day`} className="sr-only">
              {t("birthdayDay")}
            </label>
            <select
              id={`${id}-day`}
              name="birthDay"
              defaultValue={day ? String(day) : ""}
              className={selectClass}
            >
              <option value="">{t("birthdayDay")}</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-month`} className="sr-only">
              {t("birthdayMonth")}
            </label>
            <select
              id={`${id}-month`}
              name="birthMonth"
              defaultValue={month ? String(month) : ""}
              className={selectClass}
            >
              <option value="">{t("birthdayMonth")}</option>
              {birthMonthNames(locale).map((item) => (
                <option key={item.month} value={String(item.month)}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-site-border px-5 font-semibold text-site-text hover:border-site-accent disabled:opacity-50"
      >
        {t("birthdaySave")}
      </button>
      {state && (
        <p
          role="status"
          className={`text-sm font-semibold ${state.ok ? "text-site-accent" : "text-red-700"}`}
        >
          {state.ok ? t("birthdaySaved") : tErrors(state.error)}
        </p>
      )}
    </form>
  );
}
