import { getTranslations } from "next-intl/server";
import { PlatformFooter } from "@/components/layout/PlatformFooter";
import { PlatformHeader } from "@/components/layout/PlatformHeader";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import { formatDate } from "@/lib/format";
import { getLegalDocument, type LegalKey } from "@/modules/legal/documents";

/** Page d'un document légal (texte saisi dans l'admin, paragraphes séparés par une ligne vide). */
export async function LegalPage({ docKey, locale }: { docKey: LegalKey; locale: string }) {
  const t = await getTranslations("legal");
  const doc = await withPlatform((tx) => getLegalDocument(tx, docKey, locale));
  const config = env();
  const contact = config.SUPPORT_EMAIL ?? `support@${config.MAIN_DOMAIN}`;
  return (
    <>
      <PlatformHeader />
      <main id="contenu" className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">{doc?.title ?? t(`titles.${docKey}`)}</h1>
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
