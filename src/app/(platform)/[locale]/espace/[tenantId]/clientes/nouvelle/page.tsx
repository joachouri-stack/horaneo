import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden } from "@/components/admin/fields";
import { CustomerFields } from "@/components/manager/CustomerFields";
import { ui } from "@/components/ui/styles";
import { managerPage } from "@/lib/manager/page";
import { saveCustomerAction } from "../../actions";

export default async function NewCustomerPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/clientes/nouvelle">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.customers");
  const tCommon = await getTranslations("common");
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">{t("new")}</h1>
      <div className={ui.card}>
        <ActionForm action={saveCustomerAction} submitLabel={tCommon("save")}>
          <Hidden values={{ tenantId: page.tenantId }} />
          <CustomerFields />
        </ActionForm>
      </div>
    </div>
  );
}
