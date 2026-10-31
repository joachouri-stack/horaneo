import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/LegalPage";
import { resolveLocale } from "@/i18n/translator";

export async function generateMetadata({ params }: PageProps<"/[locale]/conditions">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "legal" });
  // Adresse de référence (relative : complétée par metadataBase du layout).
  return { title: t("titles.terms"), alternates: { canonical: `/${(await params).locale}/conditions` } };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/conditions">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  return <LegalPage docKey="terms" locale={locale} />;
}
