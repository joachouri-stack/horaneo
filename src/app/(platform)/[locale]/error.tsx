"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { ui } from "@/components/ui/styles";
import { Link } from "@/i18n/navigation";

/** Erreur inattendue dans le site commercial ou les espaces : message clair et bouton pour réessayer. */
export default function PlatformError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("platformErrors");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="contenu" className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-extrabold">{t("errorTitle")}</h1>
      <p className="mt-3 text-ink/70">{t("errorText")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className={ui.primaryButton}>
          {t("retry")}
        </button>
        <Link href="/" className={ui.secondaryButton}>
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
