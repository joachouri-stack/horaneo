"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Erreur inattendue sur le site d'un client : message dans la langue et les couleurs
 * du site (en-tête et pied de page gardés), avec « Réessayer » et le retour à l'accueil.
 */
export default function TenantError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("site");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="contenu" className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-site-display text-3xl font-semibold text-site-heading">{t("errorPage.title")}</h1>
      <p className="mt-4 text-lg">{t("errorPage.text")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-12 items-center rounded-site bg-site-button px-6 font-semibold text-site-on-button transition hover:opacity-90"
        >
          {t("errorPage.retry")}
        </button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-site border border-site-border px-6 font-semibold text-site-text"
        >
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
