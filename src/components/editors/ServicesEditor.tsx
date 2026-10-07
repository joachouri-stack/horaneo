import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { ServiceFields } from "@/components/admin/ServiceFields";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import { formatMoney } from "@/lib/format";
import { CATEGORY_ICONS } from "@/modules/catalog/icons";
import type { listCategories, listServices } from "@/modules/catalog/services";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;

/**
 * Catégories et prestations d'un établissement. Partagé entre l'espace admin
 * et l'espace gérante : chacun fournit ses propres actions (droits différents).
 */
export async function ServicesEditor({
  tenantId,
  businessId,
  locale,
  limit,
  categories,
  services,
  logoOptions,
  actions,
}: {
  tenantId: string;
  /** Entreprise modifiée (espace admin, site à plusieurs entreprises). */
  businessId?: string;
  locale: string;
  limit: number | null | undefined;
  categories: Awaited<ReturnType<typeof listCategories>>;
  services: Awaited<ReturnType<typeof listServices>>;
  /** Photos du site proposées comme logos d'une page formation (espace admin). */
  logoOptions?: { value: string; label: string; src: string }[];
  actions: {
    saveCategory: Action;
    deleteCategory: Action;
    saveService: Action;
    deleteService: Action;
    /** Envoi d'un logo depuis la catégorie (espace admin). */
    addCategoryLogo?: Action;
  };
}) {
  const [t, tCommon] = await Promise.all([
    getTranslations("admin.tenant.services"),
    getTranslations("common"),
  ]);
  const text = (value: LocalizedText | null) => pickLocalized(value, locale as "fr");
  const iconOptions = [
    { value: "", label: t("noIcon") },
    ...CATEGORY_ICONS.map((icon) => ({ value: icon, label: t(`icons.${icon}`) })),
  ];
  const categoryOptions = categories.map((category) => ({ value: category.id, label: text(category.name) }));

  return (
    <>
      <Section title={t("categories")}>
        <ul className="divide-y divide-navy/10">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-end gap-3 py-3">
              <ActionForm
                action={actions.saveCategory}
                submitLabel={tCommon("save")}
                variant="link"
                className="grid flex-1 items-end gap-3 sm:grid-cols-2"
              >
                <Hidden values={{ tenantId, businessId, id: category.id }} />
                <TextField
                  id={`cat-${category.id}`}
                  name="name"
                  label={t("categoryName")}
                  defaultValue={text(category.name)}
                  required
                />
                <TextField
                  id={`cat-desc-${category.id}`}
                  name="description"
                  label={t("categoryDescription")}
                  defaultValue={text(category.description)}
                />
                <SelectField
                  id={`cat-icon-${category.id}`}
                  name="icon"
                  label={t("icon")}
                  defaultValue={category.icon ?? ""}
                  options={iconOptions}
                />
                <CheckboxField name="isFeatured" label={t("featured")} defaultChecked={category.isFeatured} />
                <CheckboxField name="inMenu" label={t("inMenu")} defaultChecked={category.inMenu} />
                <CheckboxField
                  name="isTraining"
                  label={t("isTraining")}
                  defaultChecked={category.isTraining}
                />
                {logoOptions && logoOptions.length > 0 && (
                  <fieldset className="sm:col-span-2">
                    <legend className="font-semibold text-night">{t("trainingLogos")}</legend>
                    <p className="text-sm text-ink/60">{t("trainingLogosHint")}</p>
                    <input type="hidden" name="logoAssetIdsShown" value="1" />
                    <div className="grid sm:grid-cols-2">
                      {logoOptions.map((option) => (
                        <label
                          key={option.value}
                          className="flex min-h-14 cursor-pointer items-center gap-3 text-ink"
                        >
                          <input
                            type="checkbox"
                            name="logoAssetIds"
                            value={option.value}
                            defaultChecked={category.logoAssetIds.includes(option.value)}
                            className="h-6 w-6 shrink-0 accent-navy"
                          />
                          {/* Vignette : on reconnaît le logo même sans description. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={option.src}
                            alt=""
                            className="h-12 w-16 shrink-0 rounded border border-navy/10 bg-white object-contain"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="sm:col-span-2">
                  <TextArea
                    id={`cat-details-${category.id}`}
                    name="details"
                    label={t("categoryDetails")}
                    hint={t("categoryDetailsHint")}
                    rows={5}
                    defaultValue={text(category.details)}
                  />
                </div>
              </ActionForm>
              {actions.addCategoryLogo && category.isTraining && (
                <ActionForm
                  action={actions.addCategoryLogo}
                  submitLabel={t("addLogo")}
                  variant="secondary"
                  resetOnSuccess
                  className="grid w-full items-end gap-3 rounded-lg bg-navy/5 p-4 sm:grid-cols-2"
                >
                  <Hidden values={{ tenantId, businessId, id: category.id }} />
                  <div>
                    <label htmlFor={`logo-file-${category.id}`} className="font-semibold text-night">
                      {t("addLogoFile")}
                    </label>
                    <input
                      id={`logo-file-${category.id}`}
                      name="file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif"
                      required
                      className="mt-1 block w-full text-sm"
                    />
                    <p className="mt-1 text-sm text-ink/60">{t("addLogoHint")}</p>
                  </div>
                  <TextField id={`logo-alt-${category.id}`} name="alt" label={t("addLogoName")} />
                </ActionForm>
              )}
              <ActionForm
                action={actions.deleteCategory}
                submitLabel={tCommon("delete")}
                variant="danger"
                className=""
                confirm={tCommon("confirmDelete")}
              >
                <Hidden values={{ tenantId, businessId, id: category.id }} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm
          action={actions.saveCategory}
          submitLabel={t("newCategory")}
          variant="secondary"
          resetOnSuccess
          className="mt-4 space-y-3"
        >
          <Hidden values={{ tenantId, businessId }} />
          <TextField id="new-category-name" name="name" label={t("newCategory")} required />
        </ActionForm>
      </Section>

      <Section
        title={t("title")}
        aside={
          limit !== null && limit !== undefined ? (
            <span className="text-sm text-ink/70">
              {t("quota", { used: services.filter((service) => service.isActive).length, limit })}
            </span>
          ) : null
        }
      >
        {services.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
        <ul className="space-y-3">
          {services.map((service) => (
            <li key={service.id}>
              <details className="rounded-lg border border-navy/10 p-4">
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span className="font-semibold text-night">
                    {text(service.name)}
                    {!service.isActive && <span className="ml-2 text-sm text-ink/60">({t("disabled")})</span>}
                  </span>
                  <span className="text-ink/80">
                    {t("minutes", { count: service.durationMinutes })} ·{" "}
                    {formatMoney(service.priceCents, service.currency, locale)}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <ActionForm action={actions.saveService} submitLabel={tCommon("save")}>
                    <Hidden values={{ tenantId, businessId, id: service.id }} />
                    <ServiceFields
                      idPrefix={service.id}
                      categories={categoryOptions}
                      service={{
                        ...service,
                        name: text(service.name),
                        description: text(service.description),
                      }}
                    />
                  </ActionForm>
                  <ActionForm
                    action={actions.deleteService}
                    submitLabel={tCommon("delete")}
                    variant="danger"
                    className=""
                    confirm={tCommon("confirmDelete")}
                  >
                    <Hidden values={{ tenantId, businessId, id: service.id }} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t border-navy/10 pt-6">
          <h3 className="mb-4 text-lg font-bold">{t("newService")}</h3>
          <ActionForm action={actions.saveService} submitLabel={tCommon("add")} resetOnSuccess>
            <Hidden values={{ tenantId, businessId }} />
            <ServiceFields idPrefix="new" categories={categoryOptions} />
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
