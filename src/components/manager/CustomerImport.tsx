"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { importCustomersAction } from "@/app/(platform)/[locale]/espace/[tenantId]/actions";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import {
  decodeFile,
  guessColumns,
  IMPORT_FIELDS,
  mapRows,
  parseCsv,
  type ImportField,
} from "@/modules/customers/import-file";
import type { ImportReport } from "@/modules/customers/import";

/** Lignes envoyées à chaque appel (comme la limite côté serveur). */
const BATCH = 500;
const PREVIEW_ROWS = 5;

type Parsed = { rows: string[][]; columns: Record<ImportField, number | null> };

/**
 * Import d'un fichier clients : choix du fichier, colonnes reconnues (modifiables),
 * aperçu, puis envoi par lots et bilan (ajoutés, déjà présents, lignes ignorées).
 */
export function CustomerImport({ tenantId, listHref }: { tenantId: string; listHref: string }) {
  const t = useTranslations("manager.customers.import");
  const tErrors = useTranslations("errors");
  const fileId = useId();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapped = useMemo(() => (parsed ? mapRows(parsed.rows, parsed.columns) : []), [parsed]);
  const headers = parsed?.rows[0] ?? [];

  const readFile = async (file: File | undefined) => {
    setParsed(null);
    setReport(null);
    setError(null);
    setFileError(null);
    if (!file) return;
    const rows = parseCsv(decodeFile(await file.arrayBuffer()));
    if (rows.length < 2) {
      setFileError(t("fileEmpty"));
      return;
    }
    setParsed({ rows, columns: guessColumns(rows[0]) });
  };

  const setColumn = (field: ImportField, value: string) => {
    if (!parsed) return;
    setParsed({ ...parsed, columns: { ...parsed.columns, [field]: value === "" ? null : Number(value) } });
  };

  const start = async () => {
    if (mapped.length === 0) return;
    setError(null);
    const total: ImportReport = { created: 0, duplicates: 0, invalid: 0, problems: [], quotaReached: false };
    setProgress({ done: 0, total: mapped.length });
    for (let offset = 0; offset < mapped.length; offset += BATCH) {
      const result = await importCustomersAction(tenantId, {
        rows: mapped.slice(offset, offset + BATCH),
        consent,
      });
      if (!result.ok || !result.data) {
        setError(tErrors(result.ok ? "invalid" : result.error));
        break;
      }
      const batch = result.data;
      total.created += batch.created;
      total.duplicates += batch.duplicates;
      total.invalid += batch.invalid;
      total.problems.push(...batch.problems);
      setProgress({ done: Math.min(offset + BATCH, mapped.length), total: mapped.length });
      if (batch.quotaReached) {
        total.quotaReached = true;
        break;
      }
    }
    setProgress(null);
    setReport(total);
    setParsed(null);
  };

  if (report) {
    return (
      <div className={`${ui.card} space-y-4`} role="status">
        <h2 className="text-lg font-semibold text-night">{t("doneTitle")}</h2>
        <ul className="space-y-1 text-night">
          <li className="font-medium">{t("created", { count: report.created })}</li>
          {report.duplicates > 0 && <li>{t("duplicates", { count: report.duplicates })}</li>}
          {report.invalid > 0 && <li>{t("invalid", { count: report.invalid })}</li>}
        </ul>
        {report.quotaReached && <p className={ui.error}>{t("quotaReached")}</p>}
        {error && <p className={ui.error}>{error}</p>}
        {report.problems.length > 0 && (
          <div>
            <h3 className="font-medium text-night">{t("problemsTitle")}</h3>
            <ul className="mt-1 space-y-0.5 text-[0.9375rem] text-ink-soft">
              {report.problems.map((problem) => (
                <li key={problem.line}>{t(`problem.${problem.reason}`, { line: problem.line })}</li>
              ))}
            </ul>
            {report.invalid > report.problems.length && (
              <p className="mt-1 text-[0.9375rem] text-ink-soft">{t("moreProblems")}</p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={listHref} className={`${ui.primaryButton} sm:w-auto`}>
            {t("back")}
          </Link>
          <button type="button" onClick={() => setReport(null)} className={`${ui.secondaryButton} sm:w-auto`}>
            {t("again")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={ui.card}>
        <label htmlFor={fileId} className={ui.label}>
          {t("fileLabel")}
        </label>
        <input
          id={fileId}
          type="file"
          accept=".csv,.txt,text/csv"
          disabled={progress !== null}
          onChange={(event) => void readFile(event.target.files?.[0])}
          className={ui.fileInput}
        />
        <p className="mt-2 text-[0.9375rem] text-ink-soft">{t("fileHint")}</p>
        {fileError && (
          <p role="alert" className={`${ui.error} mt-3`}>
            {fileError}
          </p>
        )}
      </div>

      {parsed && (
        <>
          <div className={ui.card}>
            <p className="font-medium text-night">{t("found", { count: mapped.length })}</p>
            <h2 className="mt-4 font-semibold text-night">{t("columnsTitle")}</h2>
            <p className="text-[0.9375rem] text-ink-soft">{t("columnsHint")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {IMPORT_FIELDS.map((field) => (
                <label key={field} className="block">
                  <span className={ui.label}>{t(`fields.${field}`)}</span>
                  <select
                    value={parsed.columns[field] ?? ""}
                    onChange={(event) => setColumn(field, event.target.value)}
                    className={ui.input}
                  >
                    <option value="">{t("skip")}</option>
                    {headers.map((header, index) => (
                      <option key={index} value={index}>
                        {header || `#${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {parsed.columns.birthday !== null && (
              <p className="mt-3 text-[0.9375rem] text-ink-soft">{t("birthdayNote")}</p>
            )}
          </div>

          <div className={ui.card}>
            <h2 className="font-semibold text-night">{t("previewTitle")}</h2>
            <div className="-mx-1 mt-3 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-[0.9375rem]">
                <thead className="text-ink-soft">
                  <tr>
                    {(["firstName", "lastName", "phone", "email", "birthday"] as const).map((field) => (
                      <th key={field} scope="col" className="px-1 py-1.5 font-medium">
                        {t(`fields.${field}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-night">
                  {mapped.slice(0, PREVIEW_ROWS).map((row) => (
                    <tr key={row.line} className="border-t border-hairline">
                      <td className="px-1 py-1.5">{row.firstName || "—"}</td>
                      <td className="px-1 py-1.5">{row.lastName || "—"}</td>
                      <td className="px-1 py-1.5">{row.phone || "—"}</td>
                      <td className="px-1 py-1.5 break-all">{row.email || "—"}</td>
                      <td className="px-1 py-1.5">
                        {row.birthDay && row.birthMonth
                          ? `${String(row.birthDay).padStart(2, "0")}/${String(row.birthMonth).padStart(2, "0")}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${ui.card} space-y-4`}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]"
              />
              <span>
                <span className="font-medium text-night">{t("consent")}</span>
                <span className="mt-0.5 block text-[0.9375rem] text-ink-soft">{t("consentHint")}</span>
              </span>
            </label>
            {error && (
              <p role="alert" className={ui.error}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void start()}
              disabled={progress !== null || mapped.length === 0}
              className={`${ui.primaryButton} sm:w-auto disabled:opacity-60`}
            >
              {progress ? t("progress", progress) : t("submit", { count: mapped.length })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
