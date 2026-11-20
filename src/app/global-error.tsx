"use client";

import { useEffect } from "react";
import { routing } from "@/i18n/routing";
import messages from "../../messages/fr.json";

/**
 * Dernier filet : erreur dans la mise en page elle-même (site d'un client ou site
 * commercial). Aucune traduction ni couleur n'est alors chargée : page sobre, en français.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = messages.platformErrors;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang={routing.defaultLocale}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#1a1a1a",
          background: "#ffffff",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem" }}>{t.errorTitle}</h1>
          <p style={{ lineHeight: 1.5 }}>{t.errorText}</p>
          <p style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                minHeight: "3rem",
                padding: "0 1.5rem",
                borderRadius: "0.75rem",
                border: 0,
                background: "#1a1a1a",
                color: "#fff",
                fontWeight: 600,
                fontSize: "1rem",
              }}
            >
              {t.retry}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- rechargement complet voulu : la mise en page a planté */}
            <a
              href="/"
              style={{
                minHeight: "3rem",
                padding: "0 1.5rem",
                borderRadius: "0.75rem",
                border: "1px solid #ccc",
                color: "#1a1a1a",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              {t.backHome}
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
