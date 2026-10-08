import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, TextArea, TextField } from "@/components/admin/fields";
import { Link } from "@/i18n/navigation";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import type { listServices } from "@/modules/catalog/services";
import type { listStaff } from "@/modules/team/staff";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;
type Member = {
  id?: string;
  name: string;
  bio: string;
  color: string | null;
  isActive: boolean;
  serviceIds: string[];
};

/** Membres de l'équipe et prestations réalisées (admin et gérante). */
export async function TeamEditor({
  tenantId,
  businessId,
  contentLocale,
  limit,
  staff,
  services,
  actions,
  memberHref,
  headingLevel,
}: {
  tenantId: string;
  /** Entreprise modifiée (espace admin, site à plusieurs entreprises). */
  businessId?: string;
  contentLocale: string;
  limit: number | null | undefined;
  staff: Awaited<ReturnType<typeof listStaff>>;
  services: Awaited<ReturnType<typeof listServices>>;
  actions: { save: Action; remove: Action };
  /** Lien vers la page des horaires d'un membre (espace gérante). */
  memberHref?: (staffId: string) => string;
  /** Niveau du titre principal : 1 quand l'éditeur forme toute la page (espace gérante). */
  headingLevel?: 1 | 2;
}) {
  const [t, tCommon, tManager] = await Promise.all([
    getTranslations("admin.tenant.team"),
    getTranslations("common"),
    getTranslations("manager.team"),
  ]);
  const locale = contentLocale as "fr";
  const text = (value: LocalizedText | null) => pickLocalized(value, locale);

  const fields = (member: Member, prefix: string) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField id={`${prefix}-name`} name="name" label={t("name")} defaultValue={member.name} required />
      <TextField
        id={`${prefix}-color`}
        name="color"
        type="color"
        label={t("color")}
        defaultValue={member.color ?? "#6b8f71"}
      />
      <div className="sm:col-span-2">
        <TextArea id={`${prefix}-bio`} name="bio" label={t("bio")} defaultValue={member.bio} rows={2} />
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 font-semibold text-night">{t("services")}</legend>
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
      <CheckboxField name="isActive" label={t("active")} defaultChecked={member.isActive} />
    </div>
  );

  return (
    <Section
      title={t("title")}
      level={headingLevel}
      aside={
        limit !== null && limit !== undefined ? (
          <span className="text-sm text-ink/70">
            {t("quota", { used: staff.filter((member) => member.isActive).length, limit })}
          </span>
        ) : null
      }
    >
      {staff.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
      <ul className="space-y-3">
        {staff.map((member) => (
          <li key={member.id}>
            <details className="rounded-lg border border-navy/10 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold text-night [&::-webkit-details-marker]:hidden">
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-full"
                  style={{ background: member.color ?? "#6b8f71" }}
                />
                <span className="min-w-0 truncate">{member.name}</span>
                <span className="ml-auto shrink-0 text-sm font-semibold text-coral-dark underline">
                  {tCommon("edit")}
                </span>
              </summary>
              {memberHref && (
                <Link
                  href={memberHref(member.id)}
                  className="mt-3 inline-block font-semibold text-night underline"
                >
                  {tManager("schedule")} →
                </Link>
              )}
              <div className="mt-4 space-y-4">
                <ActionForm action={actions.save} submitLabel={tCommon("save")}>
                  <Hidden values={{ tenantId, businessId, id: member.id }} />
                  {fields({ ...member, bio: text(member.bio) }, member.id)}
                </ActionForm>
                <ActionForm
                  action={actions.remove}
                  submitLabel={tCommon("delete")}
                  variant="danger"
                  className=""
                  confirm={tCommon("confirmDelete")}
                >
                  <Hidden values={{ tenantId, businessId, id: member.id }} />
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {/* Formulaire replié : la liste de l'équipe reste visible d'un coup d'œil. */}
      <details className="mt-6 border-t border-navy/10 pt-4">
        <summary className="flex min-h-12 cursor-pointer list-none items-center text-lg font-bold text-night [&::-webkit-details-marker]:hidden">
          + {t("newMember")}
        </summary>
        <p className="mt-2 mb-4 text-sm text-ink/70">{t("hoursHint")}</p>
        <ActionForm action={actions.save} submitLabel={tCommon("add")} resetOnSuccess>
          <Hidden values={{ tenantId, businessId }} />
          {fields({ name: "", bio: "", color: null, isActive: true, serviceIds: [] }, "new")}
        </ActionForm>
      </details>
    </Section>
  );
}
