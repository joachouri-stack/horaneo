import { getTranslations } from "next-intl/server";
import { CustomerImport } from "@/components/manager/CustomerImport";
import { managerPage } from "@/lib/manager/page";

export default async function ImportCustomersPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/clientes/importer">) {
  const page = await managerPage(params, "customers");
  const t = await getTranslations("manager.customers.import");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink-soft">{t("intro")}</p>
      </div>
      <CustomerImport tenantId={page.tenantId} listHref={`${page.base}/clientes`} />
    </div>
  );
}
