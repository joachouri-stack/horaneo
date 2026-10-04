import { TeamEditor } from "@/components/editors/TeamEditor";
import { adminQuery } from "@/lib/admin/mutation";
import { BusinessPicker } from "@/components/admin/BusinessPicker";
import { loadAdminBusiness } from "@/lib/admin/business";
import { listServices } from "@/modules/catalog/services";
import { listStaff } from "@/modules/team/staff";
import { deleteStaffAction, saveStaffAction } from "../../actions";

/** Équipe d'un client (espace admin). */
export default async function TeamPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/equipe">) {
  const { tenantId } = await params;
  const { overview, businesses, business } = await loadAdminBusiness(tenantId, await searchParams);
  const { staff, services } = await adminQuery(
    async (tx) => ({
      staff: await listStaff(tx, tenantId),
      services: await listServices(tx, tenantId),
    }),
    business.id,
  );
  return (
    <>
      <BusinessPicker
        businesses={businesses}
        currentId={business.id}
        href={`/admin/clients/${tenantId}/equipe`}
      />
      <TeamEditor
        tenantId={tenantId}
        businessId={business.id}
        contentLocale={overview.tenant.defaultLocale}
        limit={overview.plan.limits.members}
        staff={staff}
        services={services}
        actions={{ save: saveStaffAction, remove: deleteStaffAction }}
      />
    </>
  );
}
