import { ui } from "@/components/ui/styles";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, Section, StarRating, TextArea, TextField, ToggleField } from "@/components/admin/fields";
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
      <StarRating name="rating" legend={t("rating")} defaultValue={item.rating} idPrefix={prefix} />
      <div className="sm:col-span-2">
        <TextArea id={`${prefix}-text`} name="text" label={t("text")} defaultValue={item.text} required />
      </div>
      <div className="sm:col-span-2">
        <ToggleField name="isPublished" label={t("published")} defaultChecked={item.isPublished} />
      </div>
    </div>
  );

  return (
    <Section title={t("title")} level={headingLevel}>
      {/* Nouveau témoignage : un bouton en haut, le formulaire s'ouvre au toucher. */}
      <details className="group mb-5">
        <summary
          className={`${ui.primaryButton} cursor-pointer list-none group-open:hidden sm:w-auto [&::-webkit-details-marker]:hidden`}
        >
          + {t("new")}
        </summary>
        <div className="rounded-xl border border-accent-line p-4">
          <h3 className="mb-4 text-lg font-semibold text-night">{t("new")}</h3>
          <ActionForm action={actions.save} submitLabel={tCommon("add")} resetOnSuccess>
            <Hidden values={{ tenantId }} />
            {fields({ authorName: "", text: "", rating: 5, isPublished: true }, "new")}
          </ActionForm>
        </div>
      </details>
      {items.length === 0 && <p className="text-ink/70">{t("empty")}</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <details name="temoignage" className="group rounded-lg border border-navy/10 p-4">
              <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1 font-semibold text-night">
                  {item.authorName}
                  {item.rating ? (
                    <span className="ml-2 text-[#e0a526]">{"★".repeat(item.rating)}</span>
                  ) : null}
                  {!item.isPublished && (
                    <span className="ml-2 rounded-full bg-navy/5 px-2 py-0.5 text-xs font-medium text-ink/70">
                      {t("hiddenBadge")}
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink/50 transition group-open:rotate-180">
                  ▾
                </span>
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
    </Section>
  );
}
