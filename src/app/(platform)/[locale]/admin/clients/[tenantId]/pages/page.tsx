import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { CheckboxField, Hidden, Section, SelectField, TextArea, TextField } from "@/components/admin/fields";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import { adminQuery } from "@/lib/admin/mutation";
import { loadTenantOverview } from "@/lib/admin/tenant";
import {
  PAGE_PHOTO_FIELD,
  PAGE_TEXT_FIELDS,
  SITE_PAGE_KEYS,
  getPages,
  type PageContent,
} from "@/modules/content/pages";
import { listActiveAssets } from "@/modules/media/assets";
import { savePageAction } from "../../actions";

/** Textes des pages du site (dans la langue principale du client). */
export default async function PagesPage({ params }: PageProps<"/[locale]/admin/clients/[tenantId]/pages">) {
  const { tenantId } = await params;
  const [t, tCommon, tLanguages, overview, { pages, photos }] = await Promise.all([
    getTranslations("admin.tenant.pages"),
    getTranslations("common"),
    getTranslations("languages"),
    loadTenantOverview(tenantId),
    adminQuery(async (tx) => ({
      pages: await getPages(tx, tenantId),
      photos: await listActiveAssets(tx, tenantId),
    })),
  ]);
  const locale = overview.tenant.defaultLocale as "fr";
  const photoOptions = [
    { value: "", label: t("noPhoto") },
    ...photos
      .filter((photo) => photo.kind !== "logo")
      .map((photo, index) => ({
        value: photo.id,
        label: pickLocalized(photo.alt, locale) || `Photo ${index + 1}`,
      })),
  ];

  return (
    <>
      <p className="text-ink/70">{t("language", { language: tLanguages(locale) })}</p>
      {SITE_PAGE_KEYS.map((pageKey) => {
        const page = pages.find((item) => item.pageKey === pageKey);
        const content = (page?.content ?? {}) as PageContent;
        const photoField = PAGE_PHOTO_FIELD[pageKey];
        return (
          <Section key={pageKey} title={t(`pageNames.${pageKey}`)}>
            <ActionForm action={savePageAction} submitLabel={tCommon("save")}>
              <Hidden values={{ tenantId, pageKey }} />
              {PAGE_TEXT_FIELDS[pageKey].map((field) => (
                <TextArea
                  key={field}
                  id={`${pageKey}-${field}`}
                  name={`text.${field}`}
                  label={t(`fields.${field}`)}
                  defaultValue={pickLocalized(content[field] as LocalizedText | undefined, locale)}
                  rows={["intro", "body", "access", "extra"].includes(field) ? 4 : 1}
                />
              ))}
              {photoField && (
                <SelectField
                  id={`${pageKey}-photo`}
                  name="photoAssetId"
                  label={t("photo")}
                  options={photoOptions}
                  defaultValue={(content[photoField] as string) ?? ""}
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={`${pageKey}-seo-title`}
                  name="seoTitle"
                  label={t("seoTitle")}
                  defaultValue={pickLocalized(page?.seoTitle, locale)}
                />
                <TextField
                  id={`${pageKey}-seo-description`}
                  name="seoDescription"
                  label={t("seoDescription")}
                  defaultValue={pickLocalized(page?.seoDescription, locale)}
                />
              </div>
              <CheckboxField
                name="isPublished"
                label={t("published")}
                defaultChecked={page?.isPublished ?? false}
              />
            </ActionForm>
          </Section>
        );
      })}
    </>
  );
}
