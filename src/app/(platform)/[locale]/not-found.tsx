import { getTranslations } from "next-intl/server";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";

/** Page introuvable du site commercial et des espaces gérante et admin. */
export default async function PlatformNotFound() {
  const t = await getTranslations("platformErrors");
  return (
    <main id="contenu" className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="text-6xl font-extrabold">404</p>
      <h1 className="mt-4 text-2xl font-extrabold">{t("notFoundTitle")}</h1>
      <p className="mt-3 text-ink/70">{t("notFoundText")}</p>
      <p className="mt-8">
        <Link href="/" className={ui.primaryButton}>
          {t("backHome")}
        </Link>
      </p>
    </main>
  );
}
