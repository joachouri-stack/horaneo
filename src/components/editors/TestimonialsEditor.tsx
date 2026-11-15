import { ui } from "@/components/ui/styles";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, TextArea, TextField } from "@/components/admin/fields";
import { pickLocalized } from "@/i18n/locales";
import type { ActionResult } from "@/lib/actions/result";
import type { listTestimonials } from "@/modules/content/testimonials";

type Action = (previous: ActionResult<unknown> | null, data: FormData) => Promise<ActionResult<unknown>>;

/** Témoignages saisis à la main (admin et gérante). */
export async function TestimonialsEditor({
  tenantId,
  contentLocale,
  available,
  items,
  actions,
  headingLevel,
}: {
  tenantId: string;
  contentLocale: string;
  available: boolean;
  items: Awaited<ReturnType<typeof listTestimonials>>;
  actions: { save: Action; remove: Action };
  /** Niveau du titre principal : 1 quand l'éditeur forme toute la page (espace gérante). */
  headingLevel?: 1 | 2;
}) {
  const [t, tCommon, tErrors] = await Promise.all([
    getTranslations("admin.tenant.testimonials"),
    getTranslations("common"),
    getTranslations("errors"),
  ]);
  const locale = contentLocale as "fr";
  if (!available) {
    return (
      <Section title={t("title")} level={headingLevel}>
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
    <Section title={t("title")} level={headingLevel}>
      {items.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <details className="rounded-lg border border-navy/10 p-4">
              <summary className="cursor-pointer py-2.5 font-semibold text-night">
                {item.authorName}
                {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
              </summary>
              <div className="mt-4 space-y-4">
                <ActionForm action={actions.save} submitLabel={tCommon("save")}>
                  <Hidden values={{ tenantId, id: item.id }} />
                  {fields({ ...item, text: pickLocalized(item.text, locale) }, item.id)}
                </ActionForm>
                <ActionForm
                  action={actions.remove}
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
      {/* Nouveau témoignage : formulaire replié, la liste reste courte. */}
      <details className="mt-6 border-t border-navy/10 pt-6">
        <summary
          className={`${ui.secondaryButton} cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden`}
        >
          + {t("new")}
        </summary>
        <div className="mt-4">
          <ActionForm action={actions.save} submitLabel={tCommon("add")} resetOnSuccess>
            <Hidden values={{ tenantId }} />
            {fields({ authorName: "", text: "", rating: 5, isPublished: true }, "new")}
          </ActionForm>
        </div>
      </details>
    </Section>
  );
}
