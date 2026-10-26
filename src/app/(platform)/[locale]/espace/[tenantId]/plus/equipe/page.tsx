import { getTranslations } from "next-intl/server";
import { TeamBoard } from "@/components/manager/TeamBoard";
import { ui } from "@/components/ui/styles";
import { managerPage } from "@/lib/manager/page";
import { listServices } from "@/modules/catalog/services";
import { listStaff } from "@/modules/team/staff";
import { deleteStaffAction, saveStaffAction, staffPhotoAction } from "../../actions";

export default async function ManagerTeamPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/equipe">) {
  const page = await managerPage(params);
  const { staff, services } = await page.db(async (tx) => ({
    staff: await listStaff(tx, page.tenantId),
    services: await listServices(tx, page.tenantId),
  }));
  const t = await getTranslations("manager.team");
  const limit = page.tenant.limits.members;
  const active = staff.filter((member) => member.isActive).length;
  return (
    <>
      {/* Plus de membres actifs que le pack n'en prévoit (après un changement de pack). */}
      {limit !== null && limit !== undefined && active > limit && (
        <p className={`${ui.card} mb-4`}>{t("overLimit", { limit })}</p>
      )}
      <TeamBoard
        tenantId={page.tenantId}
        contentLocale={page.tenant.defaultLocale}
        locale={page.locale}
        limit={page.tenant.limits.members}
        staff={staff}
        services={services}
        actions={{ save: saveStaffAction, remove: deleteStaffAction, photo: staffPhotoAction }}
        base={page.base}
      />
    </>
  );
}
