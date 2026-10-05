import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, SelectField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { pickLocalized } from "@/i18n/locales";
import { listAllRequests, monthlyRequestCounts, REQUEST_STATUSES } from "@/modules/requests/update-requests";
import { setRequestStatusAction } from "./actions";

/** Demandes de mise à jour des clientes : statut et compteur mensuel par client. */
export default async function RequestsAdminPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/demandes">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const status =
    typeof (await searchParams).statut === "string" ? ((await searchParams).statut as string) : "";
  const [t, tCommon, { requests, counts }] = await Promise.all([
    getTranslations("admin.requests"),
    getTranslations("common"),
    adminQuery(async (tx) => ({
      requests: await listAllRequests(tx, { status }),
      counts: await monthlyRequestCounts(tx),
    })),
  ]);

  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="statut" className={ui.label}>
            {t("filter")}
          </label>
          <select id="statut" name="statut" defaultValue={status} className={ui.input}>
            <option value="">{t("open")}</option>
            {REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={`${ui.secondaryButton} w-auto`}>
          {tCommon("search")}
        </button>
      </form>
      {requests.length === 0 ? (
        <p className={ui.card}>{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className={ui.card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/admin/clients/${request.tenantId}`}
                  className="text-lg font-bold text-night underline"
                >
                  {request.tenantName}
                </Link>
                <span className="text-sm text-ink/60">
                  {t("planUpdates", {
                    plan: pickLocalized(request.planName, locale),
                    rule: request.planFeatures.onDemandUpdates
                      ? "onDemand"
                      : request.planFeatures.monthlyUpdate
                        ? "monthly"
                        : "none",
                  })}{" "}
                  · {t("thisMonth", { count: counts.get(request.tenantId) ?? 0 })}
                </span>
              </div>
              <p className="mt-2 font-semibold">{request.subject}</p>
              <p className="mt-1 whitespace-pre-line text-ink/80">{request.message}</p>
              <p className="mt-2 text-sm text-ink/60">
                {t("from", {
                  email: request.authorEmail ?? "—",
                  date: formatDate(request.createdAt, locale),
                })}
              </p>
              <ActionForm
                action={setRequestStatusAction}
                submitLabel={t("setStatus")}
                variant="secondary"
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <Hidden values={{ id: request.id }} />
                <div className="min-w-48">
                  <SelectField
                    name="status"
                    label={t("filter")}
                    defaultValue={request.status}
                    options={REQUEST_STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
                  />
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
