import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/admin/fields";
import { OpeningHoursEditor } from "@/components/admin/OpeningHoursEditor";
import { staffMembers } from "@/db/schema";
import { managerPage } from "@/lib/manager/page";
import { listStaffSchedules } from "@/modules/team/schedules";
import { saveStaffScheduleAction } from "../../../actions";

/** Horaires de travail d'un membre. */
export default async function StaffSchedulePage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/equipe/[staffId]">) {
  const page = await managerPage(params);
  const { staffId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound();
  const t = await getTranslations("manager.team");
  const { member, schedules } = await page.db(async (tx) => ({
    member: (
      await tx
        .select()
        .from(staffMembers)
        .where(and(eq(staffMembers.id, staffId), eq(staffMembers.tenantId, page.tenantId)))
    )[0],
    schedules: await listStaffSchedules(tx, page.tenantId, staffId),
  }));
  if (!member) notFound();
  return (
    <Section title={`${t("schedule")} · ${member.name}`} level={1}>
      <p className="mb-4 text-sm text-ink/70">{t("scheduleHint")}</p>
      <OpeningHoursEditor
        action={saveStaffScheduleAction}
        tenantId={page.tenantId}
        extra={{ staffId }}
        initial={schedules.map((range) => ({
          weekday: range.weekday,
          opensAt: range.startsAt.slice(0, 5),
          closesAt: range.endsAt.slice(0, 5),
        }))}
      />
    </Section>
  );
}
