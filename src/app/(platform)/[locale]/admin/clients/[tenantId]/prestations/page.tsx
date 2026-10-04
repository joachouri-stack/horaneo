import { WizardNav } from "@/components/admin/WizardNav";
import { ServicesEditor } from "@/components/editors/ServicesEditor";
import { adminQuery } from "@/lib/admin/mutation";
import { BusinessPicker } from "@/components/admin/BusinessPicker";
import { loadAdminBusiness } from "@/lib/admin/business";
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
  const query = await searchParams;
  const assistant = query.assistant === "1";
  const { overview, businesses, business } = await loadAdminBusiness(tenantId, query);
  const { categories, services } = await adminQuery(
    async (tx) => ({
      categories: await listCategories(tx, tenantId),
      services: await listServices(tx, tenantId),
    }),
    business.id,
  );
  return (
    <>
      <WizardNav tenantId={tenantId} current="prestations" active={assistant} />
      <BusinessPicker
        businesses={businesses}
        currentId={business.id}
        href={`/admin/clients/${tenantId}/prestations`}
      />
      <ServicesEditor
        tenantId={tenantId}
        businessId={business.id}
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
