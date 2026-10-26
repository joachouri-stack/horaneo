import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { listDataRequests } from "@/modules/customer-space/space";
import { formatPhone } from "@/modules/phone";
import { resolveDataRequestAction } from "../../actions";

/** Demandes d'export ou de suppression des données envoyées depuis l'espace des clientes. */
export default async function CustomerDataPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/donnees-clientes">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.customerData");
  const requests = await page.db((tx) => listDataRequests(tx, page.tenantId));
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
        {t("title")}
      </h1>
      <p className="text-ink/80">{t("intro")}</p>
      {requests.length === 0 && <p className={ui.card}>{t("empty")}</p>}
      <ul className="space-y-3">
        {requests.map(({ request, firstName, lastName, email, phone }) => (
          <li key={request.id} className={`${ui.card} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-semibold">{t(`kinds.${request.kind}`)}</p>
              <span className="rounded-full bg-navy/10 px-3 py-1 text-sm font-semibold text-night">
                {t(`status.${request.status}`)}
              </span>
            </div>
            <p>
              {[firstName, lastName].filter(Boolean).join(" ")} ·{" "}
              {[email, phone && formatPhone(phone)].filter(Boolean).join(" · ")}
            </p>
            <p className="text-sm text-ink/70">
              {t("received", { date: page.fmt.short(request.createdAt) })}
            </p>
            {request.status === "new" && (
              <>
                <p className="text-sm text-ink/80">
                  {request.kind === "export" ? t("howExport") : t("howDeletion")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`${page.base}/clientes/${request.customerId}`} className={ui.secondaryButton}>
                    {t("openCustomer")}
                  </Link>
                  <ActionForm action={resolveDataRequestAction} submitLabel={t("markDone")} className="">
                    <Hidden values={{ tenantId: page.tenantId, id: request.id, status: "done" }} />
                  </ActionForm>
                  <ActionForm
                    action={resolveDataRequestAction}
                    submitLabel={t("markRejected")}
                    variant="danger"
                    className=""
                  >
                    <Hidden values={{ tenantId: page.tenantId, id: request.id, status: "rejected" }} />
                  </ActionForm>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
