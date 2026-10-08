import { getTranslations } from "next-intl/server";
import { ServicesEditor } from "@/components/editors/ServicesEditor";
import { managerPage } from "@/lib/manager/page";
import { listCategories, listServices } from "@/modules/catalog/services";
import {
  deleteCategoryAction,
  deleteServiceAction,
  saveCategoryAction,
  saveServiceAction,
} from "../../actions";

export default async function ManagerServicesPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/prestations">) {
  const page = await managerPage(params);
  const t = await getTranslations("manager.site");
  const { categories, services } = await page.db(async (tx) => ({
    categories: await listCategories(tx, page.tenantId),
    services: await listServices(tx, page.tenantId),
  }));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("services")}</h1>
      <ServicesEditor
        tenantId={page.tenantId}
        locale={page.tenant.defaultLocale}
        limit={page.tenant.limits.services}
        categories={categories}
        services={services}
        actions={{
          saveCategory: saveCategoryAction,
          deleteCategory: deleteCategoryAction,
          saveService: saveServiceAction,
          deleteService: deleteServiceAction,
        }}
      />
    </div>
  );
}
