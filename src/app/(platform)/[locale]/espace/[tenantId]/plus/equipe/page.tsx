import { TeamEditor } from "@/components/editors/TeamEditor";
import { managerPage } from "@/lib/manager/page";
import { listServices } from "@/modules/catalog/services";
import { listStaff } from "@/modules/team/staff";
import { deleteStaffAction, saveStaffAction } from "../../actions";

export default async function ManagerTeamPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/equipe">) {
  const page = await managerPage(params);
  const { staff, services } = await page.db(async (tx) => ({
    staff: await listStaff(tx, page.tenantId),
    services: await listServices(tx, page.tenantId),
  }));
  return (
    <TeamEditor
      tenantId={page.tenantId}
      contentLocale={page.tenant.defaultLocale}
      limit={page.tenant.limits.members}
      staff={staff}
      services={services}
      actions={{ save: saveStaffAction, remove: deleteStaffAction }}
      memberHref={(staffId) => `${page.base}/plus/equipe/${staffId}`}
    />
  );
}
