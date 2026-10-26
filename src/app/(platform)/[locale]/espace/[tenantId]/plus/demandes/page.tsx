import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, TextArea, TextField } from "@/components/admin/fields";
import { managerPage } from "@/lib/manager/page";
import { listTenantRequests } from "@/modules/requests/update-requests";
import { createRequestAction } from "../../actions";

/** Demandes de modification (logo, couleurs, textes) envoyées à l'administratrice. */
export default async function RequestsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/demandes">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.requests");
  const requests = await page.db((tx) => listTenantRequests(tx, page.tenantId));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <Section title={t("send")}>
        <p className="mb-4 text-ink/70">{t("intro")}</p>
        <ActionForm action={createRequestAction} submitLabel={t("send")} resetOnSuccess>
          <Hidden values={{ tenantId: page.tenantId }} />
          <TextField name="subject" label={t("subject")} required />
          <TextArea name="message" label={t("message")} rows={5} required />
        </ActionForm>
      </Section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        {requests.length === 0 ? (
          <p className="text-ink/60">{t("none")}</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded-[var(--radius-card)] bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">{request.subject}</p>
                  <span className="text-sm text-ink/60">{t(`status.${request.status}`)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-ink/80">{request.message}</p>
                <p className="mt-1 text-[0.8125rem] text-ink/50">{page.fmt.short(request.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
