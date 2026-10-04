import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { resolveLocale } from "@/i18n/translator";
import { requireAdmin } from "@/lib/auth/session";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const t = await getTranslations({ locale: resolveLocale((await params).locale), namespace: "admin" });
  return { title: t("metaTitle") };
}

/** Accueil de l'espace admin (provisoire : le tableau de bord arrive à l'étape 4). */
export default async function AdminHomePage({ params }: PageProps<"/[locale]/admin">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  await requireAdmin(locale);
  const t = await getTranslations("admin");

  return (
    <main id="contenu" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-extrabold">{t("title")}</h1>
      <p className={`mt-6 ${ui.card}`}>{t("welcome")}</p>
    </main>
  );
}
