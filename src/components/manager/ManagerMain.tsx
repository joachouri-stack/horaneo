"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * Zone de contenu de l'espace gérante : l'accueil et l'agenda prennent toute la
 * largeur sur ordinateur ; les autres pages (formulaires, listes) restent étroites.
 */
export function ManagerMain({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/espace/${tenantId}`;
  const wide = pathname === base || pathname.startsWith(`${base}/agenda`);
  return (
    <main
      id="contenu"
      className={`mx-auto px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 ${wide ? "max-w-6xl" : "max-w-3xl lg:max-w-4xl"}`}
    >
      {children}
    </main>
  );
}
