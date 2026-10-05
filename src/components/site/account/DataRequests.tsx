"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { requestDataExportAction } from "@/app/(tenant)/sites/[tenantId]/mes-rendez-vous/actions";

/** Demande de copie ou de suppression des données (transmise à l'établissement). */
export function DataRequests() {
  const t = useTranslations("site.account");
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(requestDataExportAction, null);
  const button =
    "inline-flex min-h-11 items-center justify-center rounded-full border border-site-border px-5 font-semibold text-site-text hover:border-site-accent disabled:opacity-50";
  return (
    <form action={action} className="flex flex-wrap gap-3">
      <button type="submit" name="kind" value="export" disabled={pending} className={button}>
        {t("dataExport")}
      </button>
      <button
        type="submit"
        name="kind"
        value="deletion"
        disabled={pending}
        className={button}
        onClick={(event) => {
          if (!window.confirm(t("dataConfirmDelete"))) event.preventDefault();
        }}
      >
        {t("dataDelete")}
      </button>
      {state && (
        <p
          role="status"
          className={`w-full text-sm font-semibold ${state.ok ? "text-site-accent" : "text-red-700"}`}
        >
          {state.ok ? t("dataSent") : tErrors(state.error)}
        </p>
      )}
    </form>
  );
}
