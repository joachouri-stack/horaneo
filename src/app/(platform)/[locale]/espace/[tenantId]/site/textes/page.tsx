import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextArea } from "@/components/admin/fields";
import { SharedContentNotice } from "@/components/manager/SharedContentNotice";
import { ui } from "@/components/ui/styles";
import { pickLocalized, type LocalizedText } from "@/i18n/locales";
import { resolveLocale } from "@/i18n/translator";
import { managerPage } from "@/lib/manager/page";
import { MANAGER_PAGE_KEYS, PAGE_TEXT_FIELDS, getPages, type PageContent } from "@/modules/content/pages";
import { savePageTextsAction } from "../../actions";

/** Ordre d'affichage des champs : celui de la page du site (étiquette, titre, puis texte). */
const FIELD_ORDER = ["badge", "tagline", "taglineAccent", "title", "intro", "body", "access"] as const;
type Field = (typeof FIELD_ORDER)[number];
const ordered = (fields: readonly Field[]) =>
  [...fields].sort((a, b) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b));

/** Textes de présentation du site (accueil, l'établissement, infos pratiques), modifiés par la gérante. */
export default async function ManagerPageTextsPage({
  params,
}: PageProps<"/[locale]/espace/[tenantId]/site/textes">) {
  const page = await managerPage(params);
  // Textes communs au site : modifiés depuis l'entreprise principale seulement.
  if (!page.business.isPrimary) return <SharedContentNotice />;
  const [t, tCommon] = await Promise.all([getTranslations("manager.site.texts"), getTranslations("common")]);
  const pages = await page.db((tx) => getPages(tx, page.tenantId));
  const locale = resolveLocale(page.tenant.defaultLocale);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[1.75rem] font-semibold tracking-[-0.025em] text-night">
          {t("title")}
        </h1>
        <p className="mt-1 text-ink/70">{t("intro")}</p>
      </div>
      {MANAGER_PAGE_KEYS.map((pageKey) => {
        const content = (pages.find((item) => item.pageKey === pageKey)?.content ?? {}) as PageContent;
        return (
          <section key={pageKey} className={ui.card}>
            <h2 className="text-lg font-semibold">{t(`pages.${pageKey}`)}</h2>
            <div className="mt-4">
              <ActionForm action={savePageTextsAction} submitLabel={tCommon("save")}>
                <Hidden values={{ tenantId: page.tenantId, pageKey }} />
                {ordered(PAGE_TEXT_FIELDS[pageKey]).map((field) => (
                  <TextArea
                    key={field}
                    id={`${pageKey}-${field}`}
                    name={`text.${field}`}
                    label={t(`fields.${field}`)}
                    defaultValue={pickLocalized(content[field] as LocalizedText | undefined, locale)}
                    rows={["intro", "body", "access"].includes(field) ? 5 : 2}
                  />
                ))}
              </ActionForm>
            </div>
          </section>
        );
      })}
    </div>
  );
}
