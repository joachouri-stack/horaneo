import { getTranslations } from "next-intl/server";
import { Section } from "@/components/admin/fields";
import { OpeningHoursEditor } from "@/components/admin/OpeningHoursEditor";
import { withTenant } from "@/db/access";
import { managerPage } from "@/lib/manager/page";
import { listOpeningHours } from "@/modules/schedule/opening-hours";
import { saveHoursAction } from "../../actions";

export default async function ManagerHoursPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/horaires">) {
  const page = await managerPage(params);
  const t = await getTranslations("admin.tenant.hours");
  const hours = await withTenant(page.tenantId, (tx) => listOpeningHours(tx, page.tenantId));
  return (
    <Section title={t("title")}>
      <OpeningHoursEditor
        action={saveHoursAction}
        tenantId={page.tenantId}
        initial={hours.map((range) => ({
          weekday: range.weekday,
          opensAt: range.opensAt.slice(0, 5),
          closesAt: range.closesAt.slice(0, 5),
        }))}
      />
    </Section>
  );
}
