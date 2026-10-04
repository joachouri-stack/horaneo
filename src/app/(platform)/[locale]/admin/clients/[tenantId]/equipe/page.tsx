import { TeamEditor } from "@/components/editors/TeamEditor";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { listServices } from "@/modules/catalog/services";
import { listStaff } from "@/modules/team/staff";
import { deleteStaffAction, saveStaffAction } from "../../actions";

/** Équipe d'un client (espace admin). */
export default async function TeamPage({ params }: PageProps<"/[locale]/admin/clients/[tenantId]/equipe">) {
  const { tenantId } = await params;
  const [overview, { staff, services }] = await Promise.all([
    loadTenantOverview(tenantId),
    adminQuery(async (tx) => ({
      staff: await listStaff(tx, tenantId),
      services: await listServices(tx, tenantId),
    })),
  ]);
  return (
    <TeamEditor
      tenantId={tenantId}
      contentLocale={overview.tenant.defaultLocale}
      limit={overview.plan.limits.members}
      staff={staff}
      services={services}
      actions={{ save: saveStaffAction, remove: deleteStaffAction }}
    />
  );
}
