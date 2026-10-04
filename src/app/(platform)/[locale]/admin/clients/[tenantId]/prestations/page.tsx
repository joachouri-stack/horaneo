import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, TextField } from "@/components/admin/fields";
import { ServiceFields } from "@/components/admin/ServiceFields";
import { WizardNav } from "@/components/admin/WizardNav";
import { pickLocalized } from "@/i18n/locales";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { formatMoney } from "@/lib/format";
import { listCategories, listServices } from "@/modules/catalog/services";
import {
  deleteCategoryAction,
  deleteServiceAction,
  saveCategoryAction,
  saveServiceAction,
} from "../../actions";

/** Catégories et prestations d'un client. */
export default async function ServicesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/clients/[tenantId]/prestations">) {
  const { tenantId } = await params;
  const assistant = (await searchParams).assistant === "1";
  const [t, tCommon, overview, { categories, services }] = await Promise.all([
    getTranslations("admin.tenant.services"),
    getTranslations("common"),
    loadTenantOverview(tenantId),
    adminQuery(async (tx) => ({
      categories: await listCategories(tx, tenantId),
      services: await listServices(tx, tenantId),
    })),
  ]);
  const locale = overview.tenant.defaultLocale;
  const text = (value: Parameters<typeof pickLocalized>[0]) => pickLocalized(value, locale as "fr");
  const categoryOptions = categories.map((category) => ({ value: category.id, label: text(category.name) }));
  const limit = overview.plan.limits.services;

  return (
    <>
      <WizardNav tenantId={tenantId} current="prestations" active={assistant} />

      <Section title={t("categories")}>
        <ul className="divide-y divide-navy/10">
          {categories.map((category) => (
            <li key={category.id} className="flex flex-wrap items-end gap-3 py-3">
              <ActionForm
                action={saveCategoryAction}
                submitLabel={tCommon("save")}
                variant="link"
                className="flex flex-1 flex-wrap items-end gap-3"
              >
                <Hidden values={{ tenantId, id: category.id }} />
                <div className="min-w-48 flex-1">
                  <TextField
                    id={`cat-${category.id}`}
                    name="name"
                    label={t("categoryName")}
                    defaultValue={text(category.name)}
                    required
                  />
                </div>
              </ActionForm>
              <ActionForm
                action={deleteCategoryAction}
                submitLabel={tCommon("delete")}
                variant="danger"
                className=""
                confirm={tCommon("confirmDelete")}
              >
                <Hidden values={{ tenantId, id: category.id }} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm
          action={saveCategoryAction}
          submitLabel={t("newCategory")}
          variant="secondary"
          resetOnSuccess
          className="mt-4 space-y-3"
        >
          <Hidden values={{ tenantId }} />
          <TextField id="new-category-name" name="name" label={t("newCategory")} required />
        </ActionForm>
      </Section>

      <Section
        title={t("title")}
        aside={
          limit !== null && limit !== undefined ? (
            <span className="text-sm text-ink/70">{t("quota", { used: services.length, limit })}</span>
          ) : null
        }
      >
        {services.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
        <ul className="space-y-3">
          {services.map((service) => (
            <li key={service.id}>
              <details className="rounded-lg border border-navy/10 p-4">
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span className="font-semibold text-navy">
                    {text(service.name)}
                    {!service.isActive && <span className="ml-2 text-sm text-ink/60">({t("disabled")})</span>}
                  </span>
                  <span className="text-ink/80">
                    {t("minutes", { count: service.durationMinutes })} ·{" "}
                    {formatMoney(service.priceCents, service.currency, locale)}
                  </span>
                </summary>
                <div className="mt-4 space-y-4">
                  <ActionForm action={saveServiceAction} submitLabel={tCommon("save")}>
                    <Hidden values={{ tenantId, id: service.id }} />
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
                    action={deleteServiceAction}
                    submitLabel={tCommon("delete")}
                    variant="danger"
                    className=""
                    confirm={tCommon("confirmDelete")}
                  >
                    <Hidden values={{ tenantId, id: service.id }} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <div className="mt-6 border-t border-navy/10 pt-6">
          <h3 className="mb-4 text-lg font-bold">{t("newService")}</h3>
          <ActionForm action={saveServiceAction} submitLabel={tCommon("add")} resetOnSuccess>
            <Hidden values={{ tenantId }} />
            <ServiceFields idPrefix="new" categories={categoryOptions} />
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
