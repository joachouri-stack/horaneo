import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/LegalPage";
import { resolveLocale } from "@/i18n/translator";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/confidentialite">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "legal" });
  return { title: t("titles.privacy") };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/confidentialite">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  return <LegalPage docKey="privacy" locale={locale} />;
}
