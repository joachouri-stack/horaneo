import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, SelectField, TextField } from "@/components/admin/fields";
import { OpeningHoursEditor } from "@/components/admin/OpeningHoursEditor";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { staffMembers } from "@/db/schema";
import { managerPage } from "@/lib/manager/page";
import { listCollaborators, PERMISSION_AREAS, type PermissionArea } from "@/modules/team/access";
import { listStaffSchedules } from "@/modules/team/schedules";
import {
  inviteCollaboratorAction,
  removeCollaboratorAction,
  resendInvitationAction,
  saveStaffScheduleAction,
  updateCollaboratorAction,
} from "../../../actions";

/** Fiche d'un membre : ses horaires de travail et son accès à l'espace. */
export default async function StaffSchedulePage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/plus/equipe/[staffId]">) {
  const page = await managerPage(params, "owner");
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
  // Accès de l'équipe : lus avec le rôle plateforme, filtrés sur l'entreprise de la gérante.
  const access = (await withPlatform((tx) => listCollaborators(tx, page.tenantId, page.businessId))).find(
    (row) => row.staffMemberId === member.id,
  );
  const features = page.tenant.features;
  // Cases proposées : seulement les parties que le pack comprend.
  const areas = PERMISSION_AREAS.filter(
    (area: PermissionArea) =>
      (area !== "shop" || features.commerce) &&
      (area !== "marketing" ||
        Boolean(features.promotions || features.promoCodes || features.giftCards || features.loyalty)),
  );
  const permissions = access?.permissions ?? {};
  const permissionFields = (
    <>
      <SelectField
        name="agendaScope"
        label={t("access.agenda")}
        hint={t("access.agendaHint")}
        defaultValue={permissions.agendaScope ?? "own"}
        options={[
          { value: "own", label: t("access.agendaOwn") },
          { value: "all", label: t("access.agendaAll") },
        ]}
      />
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-night">{t("access.extra")}</legend>
        {areas.map((area) => (
          <CheckboxField
            key={area}
            name={area}
            label={t(`access.areas.${area}`)}
            defaultChecked={permissions[area] === true}
          />
        ))}
      </fieldset>
      <p className="mt-2 text-sm text-ink/70">{t("access.ownerOnly")}</p>
    </>
  );

  return (
    <div className="space-y-6">
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

      <div id="acces" className="scroll-mt-6">
        <Section title={t("access.title")}>
          {access ? (
            <div className="space-y-5">
              <div className="rounded-xl bg-mist-50 p-4">
                <p className="font-semibold text-night">{t("access.open", { email: access.email })}</p>
                <p className="mt-1 text-sm text-ink/70">
                  {access.lastLoginAt
                    ? t("access.lastLogin", { date: page.fmt.short(access.lastLoginAt) })
                    : t("access.neverLoggedIn")}
                </p>
              </div>
              <ActionForm
                action={updateCollaboratorAction}
                submitLabel={t("access.save")}
                successMessage={t("access.saved")}
              >
                <Hidden values={{ tenantId: page.tenantId, staffId }} />
                {permissionFields}
              </ActionForm>
              <div className="flex flex-col gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center">
                {!access.lastLoginAt && (
                  <ActionForm
                    action={resendInvitationAction}
                    submitLabel={t("access.resend")}
                    successMessage={t("access.resent")}
                    variant="secondary"
                  >
                    <Hidden values={{ tenantId: page.tenantId, staffId }} />
                  </ActionForm>
                )}
                <ActionForm
                  action={removeCollaboratorAction}
                  submitLabel={t("access.remove")}
                  successMessage={t("access.removed")}
                  confirm={t("access.removeConfirm", { name: member.name })}
                  variant="dangerOutline"
                >
                  <Hidden values={{ tenantId: page.tenantId, staffId }} />
                </ActionForm>
              </div>
            </div>
          ) : (
            <ActionForm
              action={inviteCollaboratorAction}
              submitLabel={t("access.invite")}
              successMessage={t("access.invited")}
            >
              <p className="mb-4 text-sm text-ink/70">
                {t("access.intro", { name: member.name, product: env().PRODUCT_NAME })}
              </p>
              <Hidden values={{ tenantId: page.tenantId, staffId }} />
              <TextField name="email" type="email" label={t("access.email")} required autoComplete="off" />
              <div className="mt-4">{permissionFields}</div>
            </ActionForm>
          )}
        </Section>
      </div>
    </div>
  );
}
