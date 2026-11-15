import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { MoveButtons } from "@/components/admin/MoveButtons";
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
  variant = "admin",
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
    /** Place d'une catégorie ou d'une prestation (« monter » ou « descendre »). */
    move?: Action;
  };
  /** « manager » : présentation simplifiée de l'espace gérante (prestations d'abord, catégories repliées). */
  variant?: "admin" | "manager";
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
  // Prestations rangées par catégorie (dans l'ordre des catégories), puis celles sans catégorie.
  const groups = [
    ...categories.map((category) => ({
      key: category.id,
      title: text(category.name),
      items: services.filter((service) => service.categoryId === category.id),
    })),
    {
      key: "none",
      title: categories.length > 0 ? t("noCategory") : null,
      items: services.filter(
        (service) =>
          !service.categoryId || !categories.some((category) => category.id === service.categoryId),
      ),
    },
  ].filter((group) => group.items.length > 0);
  /** « Monter » / « Descendre » d'une catégorie ou d'une prestation, si l'espace le permet. */
  const moveButtons = (kind: "category" | "service", id: string, index: number, count: number) =>
    actions.move && count > 1 ? (
      <div className="mt-1 flex gap-x-4">
        {index > 0 && (
          <ActionForm action={actions.move} submitLabel={`↑ ${t("moveUp")}`} variant="link">
            <Hidden values={{ tenantId, businessId, id, kind, direction: "up" }} />
          </ActionForm>
        )}
        {index < count - 1 && (
          <ActionForm action={actions.move} submitLabel={`↓ ${t("moveDown")}`} variant="link">
            <Hidden values={{ tenantId, businessId, id, kind, direction: "down" }} />
          </ActionForm>
        )}
      </div>
    ) : null;

  if (variant === "manager") {
    const moveLabels = { up: t("moveUp"), down: t("moveDown") };
    const activeCount = services.filter((service) => service.isActive).length;
    return (
      <>
        <section className={`${ui.card} space-y-5`}>
          {limit !== null && limit !== undefined && (
            <p className="text-sm text-ink/70">{t("quota", { used: activeCount, limit })}</p>
          )}
          {/* Ajout : un bouton, le formulaire s'ouvre au toucher. */}
          <details className="group">
            <summary
              className={`${ui.primaryButton} cursor-pointer list-none group-open:hidden [&::-webkit-details-marker]:hidden`}
            >
              + {t("addService")}
            </summary>
            <div className="rounded-xl border border-accent-line p-4">
              <h2 className="mb-4 text-lg font-semibold text-night">{t("newService")}</h2>
              <ActionForm action={actions.saveService} submitLabel={tCommon("add")} resetOnSuccess>
                <Hidden values={{ tenantId, businessId }} />
                <ServiceFields idPrefix="new" categories={categoryOptions} simple />
              </ActionForm>
            </div>
          </details>
          {services.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
          {groups.map((group) => (
            <div key={group.key}>
              {group.title && (
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.06em] text-ink/70">
                  {group.title}
                </h3>
              )}
              <ul className="space-y-2">
                {group.items.map((service, serviceIndex) => (
                  <li key={service.id} className="flex items-start gap-1">
                    <details
                      name="prestation"
                      className="group min-w-0 flex-1 rounded-xl border border-navy/10 bg-white open:border-accent-line"
                    >
                      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate font-semibold ${service.isActive ? "text-night" : "text-ink/50"}`}
                          >
                            {text(service.name)}
                          </span>
                          <span className="block text-sm text-ink/70">
                            {t("minutes", { count: service.durationMinutes })} ·{" "}
                            {formatMoney(service.priceCents, service.currency, locale)}
                          </span>
                          {(!service.isActive || !service.isOnlineBookable) && (
                            <span className="mt-1 inline-block rounded-full bg-navy/5 px-2 py-0.5 text-xs font-medium text-ink/70">
                              {!service.isActive ? t("hiddenBadge") : t("notOnlineBadge")}
                            </span>
                          )}
                        </span>
                        <span
                          aria-hidden="true"
                          className="shrink-0 text-ink/50 transition group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </summary>
                      <div className="space-y-4 border-t border-navy/10 p-4">
                        <ActionForm action={actions.saveService} submitLabel={tCommon("save")}>
                          <Hidden values={{ tenantId, businessId, id: service.id }} />
                          <ServiceFields
                            idPrefix={service.id}
                            categories={categoryOptions}
                            simple
                            service={{
                              ...service,
                              name: text(service.name),
                              description: text(service.description),
                            }}
                          />
                        </ActionForm>
                        <ActionForm
                          action={actions.deleteService}
                          submitLabel={t("deleteService")}
                          variant="danger"
                          className=""
                          confirm={tCommon("confirmDelete")}
                        >
                          <Hidden values={{ tenantId, businessId, id: service.id }} />
                        </ActionForm>
                      </div>
                    </details>
                    {actions.move && group.items.length > 1 && (
                      <MoveButtons
                        action={actions.move}
                        values={{ tenantId, businessId, id: service.id, kind: "service" }}
                        canUp={serviceIndex > 0}
                        canDown={serviceIndex < group.items.length - 1}
                        labels={moveLabels}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Catégories : moins souvent modifiées, repliées en bas de page. */}
        <details className={`${ui.card} group`}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-lg font-semibold text-night">{t("manageCategories")}</span>
              <span className="block text-sm text-ink/70">{t("categoriesHint")}</span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-ink/50 transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            <ul className="space-y-2">
              {categories.map((category, categoryIndex) => (
                <li key={category.id} className="flex items-start gap-1">
                  <details
                    name="categorie"
                    className="group/cat min-w-0 flex-1 rounded-xl border border-navy/10 open:border-accent-line"
                  >
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 truncate font-semibold text-night">
                        {text(category.name)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-ink/50 transition group-open/cat:rotate-180"
                      >
                        ▾
                      </span>
                    </summary>
                    <div className="space-y-4 border-t border-navy/10 p-4">
                      <ActionForm action={actions.saveCategory} submitLabel={tCommon("save")}>
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
                      </ActionForm>
                      <ActionForm
                        action={actions.deleteCategory}
                        submitLabel={t("deleteCategory")}
                        variant="danger"
                        className=""
                        confirm={tCommon("confirmDelete")}
                      >
                        <Hidden values={{ tenantId, businessId, id: category.id }} />
                      </ActionForm>
                    </div>
                  </details>
                  {actions.move && categories.length > 1 && (
                    <MoveButtons
                      action={actions.move}
                      values={{ tenantId, businessId, id: category.id, kind: "category" }}
                      canUp={categoryIndex > 0}
                      canDown={categoryIndex < categories.length - 1}
                      labels={moveLabels}
                    />
                  )}
                </li>
              ))}
            </ul>
            <ActionForm
              action={actions.saveCategory}
              submitLabel={t("addCategory")}
              variant="secondary"
              resetOnSuccess
              className="space-y-3"
            >
              <Hidden values={{ tenantId, businessId }} />
              <TextField id="new-category-name" name="name" label={t("newCategory")} required />
            </ActionForm>
          </div>
        </details>
      </>
    );
  }

  return (
    <>
      <Section title={t("categories")}>
        <ul className="divide-y divide-navy/10">
          {categories.map((category, categoryIndex) => (
            <li key={category.id} className="py-2">
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 font-semibold text-night [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 truncate">{text(category.name)}</span>
                  <span className="ml-auto shrink-0 text-sm font-semibold text-coral-dark underline">
                    {tCommon("edit")}
                  </span>
                </summary>
                <div className="mt-3 flex flex-wrap items-end gap-3 pb-3">
                  <ActionForm
                    action={actions.saveCategory}
                    submitLabel={tCommon("save")}
                    variant="link"
                    className="grid w-full items-end gap-3 sm:grid-cols-2"
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
                    <CheckboxField
                      name="isFeatured"
                      label={t("featured")}
                      defaultChecked={category.isFeatured}
                    />
                    <CheckboxField name="inMenu" label={t("inMenu")} defaultChecked={category.inMenu} />
                    <CheckboxField
                      name="isTraining"
                      label={t("isTraining")}
                      defaultChecked={category.isTraining}
                    />
                    {logoOptions && logoOptions.length > 0 && (
                      <fieldset className="sm:col-span-2">
                        <legend className="font-semibold text-night">{t("trainingLogos")}</legend>
                        <p className="text-sm text-ink/70">{t("trainingLogosHint")}</p>
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
                          className={`mt-1 ${ui.fileInput}`}
                        />
                        <p className="mt-1 text-sm text-ink/70">{t("addLogoHint")}</p>
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
                </div>
              </details>
              {moveButtons("category", category.id, categoryIndex, categories.length)}
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
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key}>
              {group.title && (
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.06em] text-ink/70">
                  {group.title}
                </h3>
              )}
              <ul className="space-y-3">
                {group.items.map((service, serviceIndex) => (
                  <li key={service.id}>
                    <details className="rounded-lg border border-navy/10 p-4">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="block font-semibold text-night">
                            {text(service.name)}
                            {!service.isActive && (
                              <span className="ml-2 text-sm font-normal text-ink/70">({t("disabled")})</span>
                            )}
                          </span>
                          <span className="block text-sm text-ink/70">
                            {t("minutes", { count: service.durationMinutes })} ·{" "}
                            {formatMoney(service.priceCents, service.currency, locale)}
                          </span>
                        </span>
                        <span className="ml-auto shrink-0 text-sm font-semibold text-coral-dark underline">
                          {tCommon("edit")}
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
                    {moveButtons("service", service.id, serviceIndex, group.items.length)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* Nouvelle prestation : formulaire replié, la liste reste courte. */}
        <details className="group mt-6 border-t border-navy/10 pt-6">
          <summary
            className={`${ui.secondaryButton} cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden`}
          >
            + {t("newService")}
          </summary>
          <div className="mt-4">
            <ActionForm action={actions.saveService} submitLabel={tCommon("add")} resetOnSuccess>
              <Hidden values={{ tenantId, businessId }} />
              <ServiceFields idPrefix="new" categories={categoryOptions} />
            </ActionForm>
          </div>
        </details>
      </Section>
    </>
  );
}
