import { getTranslations } from "next-intl/server";
import { WizardNav } from "@/components/admin/WizardNav";
import { ServicesEditor } from "@/components/editors/ServicesEditor";
import { adminQuery } from "@/lib/admin/mutation";
import { BusinessPicker } from "@/components/admin/BusinessPicker";
import { loadAdminBusiness } from "@/lib/admin/business";
import { listCategories, listServices } from "@/modules/catalog/services";
import { listActiveAssets } from "@/modules/media/assets";
import { storage } from "@/lib/storage";
import { pickLocalized } from "@/i18n/locales";
import {
  addCategoryLogoAction,
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
  const tPhotos = await getTranslations("admin.tenant.photos");
  const { categories, services, photos } = await adminQuery(
    async (tx) => ({
      categories: await listCategories(tx, tenantId),
      services: await listServices(tx, tenantId),
      photos: await listActiveAssets(tx, tenantId),
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
        logoOptions={photos.map((photo, index) => ({
          value: photo.id,
          label:
            pickLocalized(photo.alt, overview.tenant.defaultLocale as "fr") ||
            tPhotos("number", { n: index + 1 }),
          src: storage().publicUrl(photo.storageKey),
        }))}
        actions={{
          saveCategory: saveCategoryAction,
          addCategoryLogo: addCategoryLogoAction,
          deleteCategory: deleteCategoryAction,
          saveService: saveServiceAction,
          deleteService: deleteServiceAction,
        }}
      />
    </>
  );
}
