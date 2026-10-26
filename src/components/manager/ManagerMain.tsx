"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * Zone de contenu de l'espace gérante : l'accueil, l'agenda, la liste des clientes, les outils et
 * les statistiques prennent toute la largeur sur ordinateur ; les autres pages (formulaires,
 * listes) restent étroites.
 */
export function ManagerMain({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/espace/${tenantId}`;
  const wide =
    pathname === base ||
    pathname.startsWith(`${base}/agenda`) ||
    pathname === `${base}/clientes` ||
    pathname === `${base}/plus` ||
    pathname.startsWith(`${base}/plus/statistiques`);
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12">
      {/* Pages étroites : alignées sur l'en-tête, à gauche. */}
      {wide ? children : <div className="max-w-3xl">{children}</div>}
    </main>
  );
}
