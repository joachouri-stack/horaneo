import { getTranslations } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { formatDate } from "@/lib/format";
import { getLegalDocument, LEGAL_IDENTITY_FIELDS, type LegalKey } from "@/modules/legal/documents";
import { getPlatformSetting } from "@/modules/settings";

/**
 * Page d'un document légal : l'identité de l'éditeur (saisie dans l'admin),
 * puis le texte publié (paragraphes séparés par une ligne vide).
 */
export async function LegalPage({ docKey, locale }: { docKey: LegalKey; locale: string }) {
  const t = await getTranslations("legal");
  const { doc, identity } = await withPlatform(async (tx) => ({
    doc: await getLegalDocument(tx, docKey, locale),
    identity: await getPlatformSetting(tx, "legal_identity"),
  }));
  // Identité saisie dans l'admin : seules les informations remplies s'affichent.
  const facts = LEGAL_IDENTITY_FIELDS[docKey]
    .map((field) => ({ field, value: (identity[field] ?? "").trim() }))
    .filter((item) => item.value !== "");
  const config = env();
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  return (
    <>
      <PlatformHeader />
      <main id="contenu" className="text-mk-body mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-mk-h2 font-semibold tracking-[-0.025em]">
          {doc?.title ?? t(`titles.${docKey}`)}
        </h1>
        {facts.length > 0 && (
          <section
            aria-labelledby="identite"
            className="mt-8 rounded-[1.25rem] border-2 border-line bg-white p-5"
          >
            <h2 id="identite" className="mb-3 text-lg font-bold text-night">
              {t("identity.title")}
            </h2>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
              {facts.map(({ field, value }) => (
                <div key={field} className="contents">
                  <dt className="font-semibold text-night">{t(`identity.fields.${field}`)}</dt>
                  <dd className="whitespace-pre-line">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
        {doc ? (
          <>
            <p className="mt-2 text-sm text-ink/60">
              {t("updated", { date: formatDate(doc.publishedAt ?? doc.createdAt, locale) })}
            </p>
            <div className="mt-8 space-y-4 leading-relaxed">
              {doc.content.split(/\n\s*\n/).map((paragraph, index) => (
                <p key={index} className="whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-6">{t("placeholder", { email: contact })}</p>
        )}
      </main>
      <PlatformFooter />
    </>
  );
}
