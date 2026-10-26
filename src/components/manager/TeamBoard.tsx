import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, TextArea, TextField } from "@/components/admin/fields";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { storage } from "@/lib/storage";
import type { listServices } from "@/modules/catalog/services";
import type { listStaff } from "@/modules/team/staff";
import { DASH_ICONS, DashIcon, panel } from "./DashboardWidgets";
import { initials } from "./DayTimeline";
import { StaffPhotoUpload } from "./StaffPhotoUpload";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
type Staff = Awaited<ReturnType<typeof listStaff>>;
type Services = Awaited<ReturnType<typeof listServices>>;

const DEFAULT_COLOR = "#6b8f71";
const VISIBLE_SERVICES = 4;

/**
 * Équipe de l'espace gérante : une carte par membre (photo ou initiales, jours travaillés,
 * prestations), modification repliée dans la carte, ajout d'un membre en fin de liste.
 */
export async function TeamBoard({
  tenantId,
  contentLocale,
  locale,
  limit,
  staff,
  services,
  actions,
  base,
}: {
  tenantId: string;
  contentLocale: string;
  locale: string;
  limit: number | null | undefined;
  staff: Staff;
  services: Services;
  actions: { save: Action; remove: Action; photo: Action };
  base: string;
}) {
  const [t, tAdmin, tCommon, tDays] = await Promise.all([
    getTranslations("manager.team"),
    getTranslations("admin.tenant.team"),
    getTranslations("common"),
    getTranslations("weekdays"),
  ]);
  const text = (value: LocalizedText | null) => pickLocalized(value, contentLocale as "fr");
  const serviceName = (id: string) => {
    const service = services.find((item) => item.id === id);
    return service ? text(service.name) : null;
  };
  const shortDay = (day: number) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, day)), // 1er janvier 2024 : un lundi.
    );
  const workDays = (days: number[]) => {
    if (days.length === 0) return t("noSchedule");
    const contiguous = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
    if (contiguous && days.length >= 3)
      return t("daysSpan", {
        from: tDays(String(days[0]) as "1").toLowerCase(),
        to: tDays(String(days.at(-1)) as "1").toLowerCase(),
      });
    return days.map(shortDay).join(", ");
  };
  const store = storage();
  const active = staff.filter((member) => member.isActive).length;
  const full = limit !== null && limit !== undefined && active >= limit;

  const fields = (
    member: { name: string; bio: string; color: string | null; isActive: boolean; serviceIds: string[] },
    prefix: string,
  ) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${prefix}-name`}
        name="name"
        label={tAdmin("name")}
        defaultValue={member.name}
        required
      />
      <TextField
        id={`${prefix}-color`}
        name="color"
        type="color"
        label={tAdmin("color")}
        defaultValue={member.color ?? DEFAULT_COLOR}
      />
      <div className="sm:col-span-2">
        <TextArea id={`${prefix}-bio`} name="bio" label={tAdmin("bio")} defaultValue={member.bio} rows={2} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 font-medium text-night">{tAdmin("services")}</legend>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {services.map((service) => (
            <CheckboxField
              key={service.id}
              name="serviceIds"
              value={service.id}
              label={text(service.name)}
              defaultChecked={member.serviceIds.includes(service.id)}
            />
          ))}
        </div>
      </fieldset>
      <CheckboxField name="isActive" label={tAdmin("active")} defaultChecked={member.isActive} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
            {tAdmin("title")}
          </h1>
          <p className="mt-1 text-ink-soft">{t("subtitle")}</p>
        </div>
        {limit !== null && limit !== undefined && (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${full ? "bg-[#fdf3e2] text-[#a8661b]" : "bg-accent-soft text-accent-strong"}`}
          >
            {tAdmin("quota", { used: active, limit })}
          </span>
        )}
      </div>

      {staff.length === 0 && <p className={`${panel} text-ink-soft`}>{tAdmin("empty")}</p>}

      <ul className="grid gap-4 md:grid-cols-2">
        {staff.map((member) => {
          const color = member.color ?? DEFAULT_COLOR;
          const names = member.serviceIds.map(serviceName).filter((name) => name !== null);
          return (
            <li key={member.id} className={`${panel} min-w-0 !p-5`}>
              <div className="flex items-start gap-4">
                {member.photoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.publicUrl(member.photoKey)}
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
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-lg font-semibold text-night">
                      {member.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-px text-[0.72rem] font-medium ${member.isActive ? "bg-[#e7f6ee] text-[#1e7a4c]" : "bg-mist-50 text-ink-soft"}`}
                    >
                      {member.isActive ? t("active") : t("inactive")}
                    </span>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                    <DashIcon d={DASH_ICONS.calendar} className="h-4 w-4" />
                    {workDays(member.workDays)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {names.length === 0 ? (
                  <span className="text-sm text-ink-soft">{t("noServices")}</span>
                ) : (
                  <>
                    {names.slice(0, VISIBLE_SERVICES).map((name) => (
                      <span
                        key={name}
                        className="rounded-full bg-mist-50 px-2.5 py-1 text-[0.8rem] text-night"
                      >
                        {name}
                      </span>
                    ))}
                    {names.length > VISIBLE_SERVICES && (
                      <span className="rounded-full bg-mist-50 px-2.5 py-1 text-[0.8rem] text-ink-soft">
                        {t("moreServices", { count: names.length - VISIBLE_SERVICES })}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                <Link
                  href={`${base}/plus/equipe/${member.id}`}
                  className="inline-flex min-h-10 items-center rounded-full bg-accent-soft px-4 text-sm font-medium text-accent-strong transition hover:bg-accent hover:text-white"
                >
                  {t("schedule")}
                </Link>
                <StaffPhotoUpload
                  tenantId={tenantId}
                  staffId={member.id}
                  hasPhoto={Boolean(member.photoKey)}
                  action={actions.photo}
                />
              </div>

              <details className="group mt-3">
                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-sm font-medium text-accent [&::-webkit-details-marker]:hidden">
                  {tCommon("edit")}
                  <span aria-hidden="true" className="transition group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <div className="mt-3 space-y-4">
                  <ActionForm action={actions.save} submitLabel={tCommon("save")}>
                    <Hidden values={{ tenantId, id: member.id }} />
                    {fields({ ...member, bio: text(member.bio) }, member.id)}
                  </ActionForm>
                  <ActionForm
                    action={actions.remove}
                    submitLabel={tCommon("delete")}
                    variant="danger"
                    className=""
                    confirm={tCommon("confirmDelete")}
                  >
                    <Hidden values={{ tenantId, id: member.id }} />
                  </ActionForm>
                </div>
              </details>
            </li>
          );
        })}

        {/* Ajout d'un membre : une carte en pointillés qui s'ouvre sur le formulaire. */}
        <li className="min-w-0 md:col-span-2">
          <details className="group rounded-[1.4rem] border-2 border-dashed border-hairline bg-white/60 p-5 open:border-solid open:bg-white">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 font-medium text-night [&::-webkit-details-marker]:hidden">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-white">
                <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
              </span>
              {tAdmin("newMember")}
              {full && <span className="text-sm font-normal text-[#a8661b]">{t("full")}</span>}
            </summary>
            <p className="mt-3 mb-4 text-sm text-ink-soft">{tAdmin("hoursHint")}</p>
            <ActionForm action={actions.save} submitLabel={tCommon("add")} resetOnSuccess>
              <Hidden values={{ tenantId }} />
              {fields({ name: "", bio: "", color: null, isActive: true, serviceIds: [] }, "new")}
            </ActionForm>
          </details>
        </li>
      </ul>
    </div>
  );
}
