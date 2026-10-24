import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/admin/ActionForm";
import { Hidden, TextArea, TextField } from "@/components/admin/fields";
import { ui } from "@/components/ui/styles";
import { resolveLocale } from "@/i18n/translator";
import { adminQuery } from "@/lib/admin/mutation";
import { requireAdmin } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getLegalDocument, LEGAL_KEYS, legalIdentityInput, salesOpen } from "@/modules/legal/documents";
import { getPlatformSetting } from "@/modules/settings";
import { publishLegalAction, saveLegalIdentityAction } from "../commandes/actions";

/** Documents légaux du site commercial, par langue, versionnés. */
export default async function LegalDocumentsPage({ params }: PageProps<"/[locale]/admin/documents">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const [t, tLegal] = await Promise.all([getTranslations("admin.documents"), getTranslations("legal")]);
  const { docs, identity, open } = await adminQuery(async (tx) => ({
    docs: await Promise.all(
      LEGAL_KEYS.map(async (key) => ({ key, doc: await getLegalDocument(tx, key, locale) })),
    ),
    identity: await getPlatformSetting(tx, "legal_identity"),
    open: await salesOpen(tx),
  }));
  const identityFields = Object.keys(legalIdentityInput.shape) as (keyof typeof identity)[];
  return (
    <main id="contenu" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <AdminSubNav group="settings" current="/admin/documents" />
      <p className="text-ink/80">{t("intro")}</p>
      <p className={open ? ui.success : ui.error}>
        {open ? t("identity.salesOpen") : t("identity.salesClosed")}
      </p>
      <section className={ui.card} aria-labelledby="doc-identity">
        <h2 id="doc-identity" className="text-xl font-bold text-night">
          {t("identity.title")}
        </h2>
        <p className="mb-4 text-sm text-ink/60">{t("identity.intro")}</p>
        <ActionForm action={saveLegalIdentityAction} submitLabel={t("identity.save")} className="space-y-4">
          {identityFields.map((field) => (
            <TextField
              key={field}
              id={`identity-${field}`}
              name={field}
              label={tLegal(`identity.fields.${field}`)}
              defaultValue={identity[field] ?? ""}
            />
          ))}
        </ActionForm>
      </section>
      {docs.map(({ key, doc }) => (
        <section key={key} className={ui.card} aria-labelledby={`doc-${key}`}>
          <h2 id={`doc-${key}`} className="text-xl font-bold text-night">
            {tLegal(`titles.${key}`)}
          </h2>
          <p className="mb-4 text-sm text-ink/60">
            {doc && doc.locale === locale
              ? t("current", {
                  version: doc.version,
                  date: formatDate(doc.publishedAt ?? doc.createdAt, locale),
                })
              : t("none")}
          </p>
          <ActionForm action={publishLegalAction} submitLabel={t("publish")} className="space-y-4">
            <Hidden values={{ key, locale }} />
            <TextField
              id={`title-${key}`}
              name="title"
              label={t("titleLabel")}
              defaultValue={doc?.title ?? tLegal(`titles.${key}`)}
              required
            />
            <TextArea
              id={`content-${key}`}
              name="content"
              label={t("content")}
              hint={t("contentHint")}
              defaultValue={doc?.content ?? ""}
              rows={12}
            />
          </ActionForm>
        </section>
      ))}
    </main>
  );
}
