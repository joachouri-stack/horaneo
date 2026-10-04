import { getTranslations } from "next-intl/server";
import { Section } from "@/components/admin/fields";
import { OpeningHoursEditor } from "@/components/admin/OpeningHoursEditor";
import { WizardNav } from "@/components/admin/WizardNav";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { listOpeningHours } from "@/modules/schedule/opening-hours";

export default async function HoursPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/horaires">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, , hours] = await Promise.all([
    getTranslations("admin.tenant.hours"),
    loadTenantOverview(tenantId),
    adminQuery((tx) => listOpeningHours(tx, tenantId)),
  ]);
  return (
    <>
      <WizardNav tenantId={tenantId} current="horaires" active={assistant} />
      <Section title={t("title")}>
        <OpeningHoursEditor
          tenantId={tenantId}
          initial={hours.map((range) => ({
            weekday: range.weekday,
            opensAt: range.opensAt.slice(0, 5),
            closesAt: range.closesAt.slice(0, 5),
          }))}
        />
      </Section>
    </>
  );
}
