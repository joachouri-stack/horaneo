import { WizardNav } from "@/components/admin/WizardNav";
import { ServicesEditor } from "@/components/editors/ServicesEditor";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { listCategories, listServices } from "@/modules/catalog/services";
import {
  deleteCategoryAction,
  deleteServiceAction,
  saveCategoryAction,
  saveServiceAction,
} from "../../actions";

/** Catégories et prestations d'un client (espace admin). */
export default async function ServicesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/prestations">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [overview, { categories, services }] = await Promise.all([
    loadTenantOverview(tenantId),
    adminQuery(async (tx) => ({
      categories: await listCategories(tx, tenantId),
      services: await listServices(tx, tenantId),
    })),
  ]);
  return (
    <>
      <WizardNav tenantId={tenantId} current="prestations" active={assistant} />
      <ServicesEditor
        tenantId={tenantId}
        locale={overview.tenant.defaultLocale}
        limit={overview.plan.limits.services}
        categories={categories}
        services={services}
        actions={{
          saveCategory: saveCategoryAction,
          deleteCategory: deleteCategoryAction,
          saveService: saveServiceAction,
          deleteService: deleteServiceAction,
        }}
      />
    </>
  );
}
