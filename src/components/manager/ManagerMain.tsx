"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Page parente d'une page de détail (lien « ‹ Agenda », « ‹ Clientes »…) : indispensable
 * dans l'application installée, qui n'a pas de bouton retour sur iPhone.
 */
function parentOf(
  segments: string[],
): { path: string; label: "today" | "agenda" | "customers" | "site" | "more" | "team" } | null {
  const [first] = segments;
  if (first === "rendez-vous") return { path: "/agenda", label: "agenda" };
  if (first === "notifications") return { path: "", label: "today" };
  if (first === "indisponibilites") return { path: "/plus", label: "more" };
  if (first === "plus" && segments[1] === "equipe" && segments.length > 2)
    return { path: "/plus/equipe", label: "team" };
  if (segments.length < 2) return null;
  if (first === "clientes") return { path: "/clientes", label: "customers" };
  if (first === "site") return { path: "/site", label: "site" };
  if (first === "plus") return { path: "/plus", label: "more" };
  return null;
}

/**
 * Zone de contenu de l'espace gérante : l'accueil, l'agenda, la liste des clientes, les outils et
 * les statistiques prennent toute la largeur sur ordinateur ; les autres pages (formulaires,
 * listes) restent étroites.
 */
export function ManagerMain({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const t = useTranslations("manager");
  const pathname = usePathname();
  const base = `/espace/${tenantId}`;
  const parent = parentOf(pathname.slice(base.length).split("/").filter(Boolean));
  const parentLabel = parent ? (parent.label === "team" ? t("more.team") : t(`tabs.${parent.label}`)) : "";
  const wide =
    pathname === base ||
    pathname.startsWith(`${base}/agenda`) ||
    pathname === `${base}/clientes` ||
    pathname === `${base}/plus` ||
    pathname.startsWith(`${base}/plus/statistiques`);
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12">
      {parent && (
        <Link
          href={`${base}${parent.path}`}
          aria-label={t("back", { page: parentLabel })}
          className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-[0.95rem] font-medium text-accent hover:bg-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {parentLabel}
        </Link>
      )}
      {/* Pages étroites : alignées sur l'en-tête, à gauche. */}
      {wide ? children : <div className="max-w-3xl">{children}</div>}
    </main>
  );
}
