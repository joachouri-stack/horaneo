import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { ChipCheckboxes, Hidden, TextArea, TextField, ToggleField } from "@/components/admin/fields";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { storage } from "@/lib/storage";
import type { listServices } from "@/modules/catalog/services";
import type { listStaff } from "@/modules/team/staff";
import { DASH_ICONS, DashIcon, panel } from "./DashboardWidgets";
import { initials } from "./DayTimeline";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
type Staff = Awaited<ReturnType<typeof listStaff>>;
type Services = Awaited<ReturnType<typeof listServices>>;

export const DEFAULT_COLOR = "#6b8f71";

/**
 * Équipe de l'espace gérante : bouton d'ajout en haut, puis une carte par membre (photo ou
 * initiales, jours travaillés, nombre de prestations) qui ouvre sa fiche.
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
  withAccess = [],
}: {
  tenantId: string;
  contentLocale: string;
  locale: string;
  limit: number | null | undefined;
  staff: Staff;
  services: Services;
  actions: { save: Action };
  base: string;
  /** Membres qui ont un accès à l'espace (collaborateurs). */
  withAccess?: string[];
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
            className={`rounded-full px-3 py-1 text-sm font-medium ${full ? "bg-[#fdf3e2] text-[#8a5212]" : "bg-accent-soft text-accent-strong"}`}
          >
            {tAdmin("quota", { used: active, limit })}
          </span>
        )}
      </div>

      {/* Ajout d'un membre : un bouton, le formulaire s'ouvre au toucher. */}
      <details className="group rounded-[1.4rem] border border-hairline bg-white open:p-5">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-center gap-2 rounded-[1.4rem] bg-accent px-5 font-medium text-white group-open:hidden [&::-webkit-details-marker]:hidden">
          <DashIcon d={DASH_ICONS.plus} className="h-5 w-5" />
          {t("addMember")}
        </summary>
        <h2 className="text-lg font-semibold text-night">{tAdmin("newMember")}</h2>
        {full && <p className="mt-1 text-sm text-[#8a5212]">{t("full")}</p>}
        <p className="mt-1 mb-4 text-sm text-ink-soft">{tAdmin("hoursHint")}</p>
        <ActionForm action={actions.save} submitLabel={tCommon("add")} resetOnSuccess>
          <Hidden values={{ tenantId, isActive: "on" }} />
          <StaffFields
            prefix="new"
            member={{ name: "", bio: "", color: null, isActive: true, serviceIds: [] }}
            services={services}
            contentLocale={contentLocale}
          />
        </ActionForm>
      </details>

      {staff.length === 0 && <p className={`${panel} text-ink-soft`}>{tAdmin("empty")}</p>}

      {/* Un membre = une carte : on la touche pour ouvrir sa fiche (infos, horaires, accès). */}
      <ul className="grid gap-3 md:grid-cols-2">
        {staff.map((member) => {
          const color = member.color ?? DEFAULT_COLOR;
          const names = member.serviceIds.map(serviceName).filter((name) => name !== null);
          return (
            <li key={member.id} className="min-w-0">
              <Link
                href={`${base}/plus/equipe/${member.id}`}
                className={`${panel} flex items-center gap-4 !p-4 transition hover:border-accent-line`}
              >
                {member.photoKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.publicUrl(member.photoKey)}
                    alt=""
                    className="size-14 shrink-0 rounded-full object-cover ring-2 ring-offset-2"
                    style={{ ["--tw-ring-color" as string]: color }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {initials(member.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display text-lg font-semibold text-night">
                      {member.name}
                    </span>
                    {!member.isActive && (
                      <span className="rounded-full bg-mist-50 px-2 py-px text-[0.72rem] font-medium text-ink-soft">
                        {t("inactive")}
                      </span>
                    )}
                    {withAccess.includes(member.id) && (
                      <span className="rounded-full bg-accent-soft px-2 py-px text-[0.72rem] font-medium text-accent-strong">
                        {t("access.badge")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-ink-soft">
                    {workDays(member.workDays)}
                  </span>
                  <span className="block truncate text-sm text-ink-soft">
                    {names.length === 0 ? t("noServices") : t("servicesCount", { count: names.length })}
                  </span>
                </span>
                <DashIcon d={DASH_ICONS.arrow} className="h-5 w-5 shrink-0 text-accent" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Champs d'un membre : nom et prestations (pastilles) d'abord ; couleur et présentation
 * repliées sous « Plus d'options ». L'interrupteur « Actif » seulement en modification.
 */
export async function StaffFields({
  prefix,
  member,
  services,
  contentLocale,
  withActive = false,
}: {
  prefix: string;
  member: { name: string; bio: string; color: string | null; isActive: boolean; serviceIds: string[] };
  services: Services;
  contentLocale: string;
  withActive?: boolean;
}) {
  const [t, tAdmin, tServices] = await Promise.all([
    getTranslations("manager.team"),
    getTranslations("admin.tenant.team"),
    getTranslations("admin.tenant.services"),
  ]);
  const text = (value: LocalizedText | null) => pickLocalized(value, contentLocale as "fr");
  return (
    <div className="space-y-5">
      <TextField
        id={`${prefix}-name`}
        name="name"
        label={tAdmin("name")}
        defaultValue={member.name}
        required
      />
      {services.length > 0 && (
        <ChipCheckboxes
          name="serviceIds"
          legend={t("servicesLegend")}
          options={services.map((service) => ({ value: service.id, label: text(service.name) }))}
          defaultValues={member.serviceIds}
        />
      )}
      {withActive && (
        <div className="rounded-xl border border-navy/10 px-4">
          <ToggleField
            name="isActive"
            label={tAdmin("active")}
            hint={t("activeHint")}
            defaultChecked={member.isActive}
          />
        </div>
      )}
      <details className="group/opts rounded-xl bg-mist-50 px-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-medium text-night [&::-webkit-details-marker]:hidden">
          {tServices("moreOptions")}
          <span aria-hidden="true" className="text-ink/50 transition group-open/opts:rotate-180">
            ▾
          </span>
        </summary>
        <div className="space-y-4 pb-4">
          <TextField
            id={`${prefix}-color`}
            name="color"
            type="color"
            label={tAdmin("color")}
            defaultValue={member.color ?? DEFAULT_COLOR}
          />
          <TextArea
            id={`${prefix}-bio`}
            name="bio"
            label={tAdmin("bio")}
            defaultValue={member.bio}
            rows={2}
          />
        </div>
      </details>
    </div>
  );
}
