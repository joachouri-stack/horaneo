import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";

/** Ancienne page, réunie dans « Mon site » (les liens déjà envoyés y mènent toujours). */
export default async function Moved({ params }: PageProps<"/[locale]/espace/[tenantId]/site/couleurs">) {
  const { locale, tenantId } = await params;
  redirect({ href: `/espace/${tenantId}/site`, locale: resolveLocale(locale) });
}
