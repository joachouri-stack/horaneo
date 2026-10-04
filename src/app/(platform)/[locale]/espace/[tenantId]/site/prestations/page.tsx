import { ServicesEditor } from "@/components/editors/ServicesEditor";
import { withTenant } from "@/db/access";
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
  const { categories, services } = await withTenant(page.tenantId, async (tx) => ({
    categories: await listCategories(tx, page.tenantId),
    services: await listServices(tx, page.tenantId),
  }));
  return (
    <div className="space-y-6">
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
