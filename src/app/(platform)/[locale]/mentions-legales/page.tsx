import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/marketing/LegalPage";
import { resolveLocale } from "@/i18n/translator";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/mentions-legales">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "legal" });
  return { title: t("titles.legal_notice") };
}

export default async function LegalNoticePage({ params }: PageProps<"/[locale]/mentions-legales">) {
  await connection();
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  return <LegalPage docKey="legal_notice" locale={locale} />;
}
