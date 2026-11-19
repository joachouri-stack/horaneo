import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, SelectField, TextField, ToggleField } from "@/components/admin/fields";
import { OpeningHoursEditor } from "@/components/admin/OpeningHoursEditor";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { DEFAULT_COLOR, StaffFields } from "@/components/manager/TeamBoard";
import { StaffPhotoUpload } from "@/components/manager/StaffPhotoUpload";
import { initials } from "@/components/manager/DayTimeline";
import { panel } from "@/components/manager/DashboardWidgets";
import { pickLocalized } from "@/i18n/locales";
import { Link } from "@/i18n/navigation";
import { managerPage } from "@/lib/manager/page";
import { storage } from "@/lib/storage";
import { listServices } from "@/modules/catalog/services";
import { listStaff } from "@/modules/team/staff";
import { listCollaborators, PERMISSION_AREAS, type PermissionArea } from "@/modules/team/access";
import { listStaffSchedules } from "@/modules/team/schedules";
import {
  deleteStaffAction,
  inviteCollaboratorAction,
  removeCollaboratorAction,
  resendInvitationAction,
  saveStaffAction,
  saveStaffScheduleAction,
  staffPhotoAction,
  updateCollaboratorAction,
} from "../../../actions";

/** Onglets de la fiche, dans l'adresse (?onglet=…) : une seule partie affichée à la fois. */
const TABS = ["infos", "horaires", "acces"] as const;
type Tab = (typeof TABS)[number];

/** Fiche d'un membre, en trois onglets : infos (photo, prestations), horaires de travail, accès à l'espace. */
export default async function StaffSchedulePage({
  params,
  searchParams,
}: PageProps<"/[locale]/espace/[tenantId]/plus/equipe/[staffId]">) {
  const page = await managerPage(params, "owner");
  const { staffId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(staffId)) notFound();
  const requested = (await searchParams).onglet;
  const tab: Tab = TABS.find((value) => value === requested) ?? "infos";
  const [t, tCommon] = await Promise.all([getTranslations("manager.team"), getTranslations("common")]);
  const { member, schedules, services } = await page.db(async (tx) => ({
    member: (await listStaff(tx, page.tenantId)).find((item) => item.id === staffId),
    schedules: await listStaffSchedules(tx, page.tenantId, staffId),
    services: await listServices(tx, page.tenantId),
  }));
  if (!member) notFound();
  const color = member.color ?? DEFAULT_COLOR;
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
        <legend className="font-medium text-night">{t("access.extra")}</legend>
        {areas.map((area) => (
          <ToggleField
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

  const segment =
    "flex min-h-10 flex-1 items-center justify-center rounded-lg px-3 text-[0.9375rem] font-medium text-ink-soft transition hover:text-night aria-[current=page]:bg-white aria-[current=page]:text-night aria-[current=page]:shadow-[0_1px_3px_rgba(15,24,48,.12)]";

  return (
    <div className="space-y-6">
      {/* En-tête : photo (ou initiales) et nom. */}
      <div className="flex items-center gap-4">
        {member.photoKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={storage().publicUrl(member.photoKey)}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover ring-2 ring-offset-2"
            style={{ ["--tw-ring-color" as string]: color }}
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {initials(member.name)}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="truncate font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {member.name}
          </h1>
          {/* Photo : modifiable depuis l'onglet Infos. */}
          {tab === "infos" && (
            <StaffPhotoUpload
              tenantId={page.tenantId}
              staffId={member.id}
              hasPhoto={Boolean(member.photoKey)}
              action={staffPhotoAction}
            />
          )}
        </div>
      </div>

      <nav aria-label={t("tabsLabel")} className="flex rounded-xl bg-[#eceff5] p-1">
        {TABS.map((value) => (
          <Link
            key={value}
            href={`${page.base}/plus/equipe/${staffId}${value === "infos" ? "" : `?onglet=${value}`}`}
            aria-current={tab === value ? "page" : undefined}
            className={segment}
          >
            {t(`tabs.${value}`)}
          </Link>
        ))}
      </nav>

      {tab === "infos" && (
        <div className="space-y-6">
          <section className={panel}>
            <ActionForm action={saveStaffAction} submitLabel={tCommon("save")}>
              <Hidden values={{ tenantId: page.tenantId, id: member.id }} />
              <StaffFields
                prefix={member.id}
                member={{ ...member, bio: pickLocalized(member.bio, page.tenant.defaultLocale as "fr") }}
                services={services}
                contentLocale={page.tenant.defaultLocale}
                withActive
                servicesHref={`${page.base}/site/prestations`}
              />
            </ActionForm>
          </section>
          <ActionForm
            action={deleteStaffAction}
            submitLabel={t("deleteMember")}
            variant="danger"
            className=""
            confirm={tCommon("confirmDelete")}
          >
            <Hidden values={{ tenantId: page.tenantId, id: member.id }} />
          </ActionForm>
        </div>
      )}

      {tab === "horaires" && (
        <Section title={t("schedule")}>
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
      )}

      {tab === "acces" && (
        <div>
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
      )}
    </div>
  );
}
