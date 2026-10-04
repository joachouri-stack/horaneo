import { getTranslations } from "next-intl/server";
import { Section } from "@/components/admin/fields";
import { OpeningHoursEditor } from "@/components/admin/OpeningHoursEditor";
import { WizardNav } from "@/components/admin/WizardNav";
import { adminQuery } from "@/lib/admin/mutation";
import { BusinessPicker } from "@/components/admin/BusinessPicker";
import { loadAdminBusiness } from "@/lib/admin/business";
import { listOpeningHours } from "@/modules/schedule/opening-hours";
import { saveHoursAction } from "../../actions";

export default async function HoursPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/horaires">) {
  const { tenantId } = await params;
  const query = await searchParams;
  const assistant = query.assistant === "1";
  const { businesses, business } = await loadAdminBusiness(tenantId, query);
  const [t, hours] = await Promise.all([
    getTranslations("admin.tenant.hours"),
    adminQuery((tx) => listOpeningHours(tx, tenantId), business.id),
  ]);
  return (
    <>
      <WizardNav tenantId={tenantId} current="horaires" active={assistant} />
      <BusinessPicker
        businesses={businesses}
        currentId={business.id}
        href={`/admin/clients/${tenantId}/horaires`}
      />
      <Section title={t("title")}>
        <OpeningHoursEditor
          action={saveHoursAction}
          tenantId={tenantId}
          extra={{ businessId: business.id }}
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
