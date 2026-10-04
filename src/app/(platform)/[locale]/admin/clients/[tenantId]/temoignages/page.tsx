import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, TextArea, TextField } from "@/components/admin/fields";
import { pickLocalized } from "@/i18n/locales";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import { listTestimonials } from "@/modules/content/testimonials";
import { deleteTestimonialAction, saveTestimonialAction } from "../../actions";

/** Témoignages saisis à la main. */
export default async function TestimonialsPage({
  params,
}: PageProps<"/[locale]/admin/clients/[tenantId]/temoignages">) {
  const { tenantId } = await params;
  const [t, tCommon, tErrors, overview, items] = await Promise.all([
    getTranslations("admin.tenant.testimonials"),
    getTranslations("common"),
    getTranslations("errors"),
    loadTenantOverview(tenantId),
    adminQuery((tx) => listTestimonials(tx, tenantId)),
  ]);
  const locale = overview.tenant.defaultLocale as "fr";
  if (!overview.plan.features.testimonials) {
    return (
      <Section title={t("title")}>
        <p>{tErrors("feature_unavailable")}</p>
      </Section>
    );
  }

  const fields = (
    item: { authorName: string; text: string; rating: number | null; isPublished: boolean },
    prefix: string,
  ) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${prefix}-author`}
        name="authorName"
        label={t("author")}
        defaultValue={item.authorName}
        required
      />
      <TextField
        id={`${prefix}-rating`}
        name="rating"
        type="number"
        inputMode="numeric"
        label={t("rating")}
        defaultValue={item.rating}
      />
      <div className="sm:col-span-2">
        <TextArea id={`${prefix}-text`} name="text" label={t("text")} defaultValue={item.text} required />
      </div>
      <CheckboxField name="isPublished" label={t("published")} defaultChecked={item.isPublished} />
    </div>
  );

  return (
    <Section title={t("title")}>
      {items.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <details className="rounded-lg border border-navy/10 p-4">
              <summary className="cursor-pointer font-semibold text-navy">
                {item.authorName}
                {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
              </summary>
              <div className="mt-4 space-y-4">
                <ActionForm action={saveTestimonialAction} submitLabel={tCommon("save")}>
                  <Hidden values={{ tenantId, id: item.id }} />
                  {fields({ ...item, text: pickLocalized(item.text, locale) }, item.id)}
                </ActionForm>
                <ActionForm
                  action={deleteTestimonialAction}
                  submitLabel={tCommon("delete")}
                  variant="danger"
                  className=""
                  confirm={tCommon("confirmDelete")}
                >
                  <Hidden values={{ tenantId, id: item.id }} />
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>
      <div className="mt-6 border-t border-navy/10 pt-6">
        <h3 className="mb-4 text-lg font-bold">{t("new")}</h3>
        <ActionForm action={saveTestimonialAction} submitLabel={tCommon("add")} resetOnSuccess>
          <Hidden values={{ tenantId }} />
          {fields({ authorName: "", text: "", rating: 5, isPublished: true }, "new")}
        </ActionForm>
      </div>
    </Section>
  );
}
