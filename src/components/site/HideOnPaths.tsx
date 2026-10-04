"use client";

import { usePathname } from "next/navigation";

/** Masque son contenu sur certaines pages (ex. la barre « Réserver » sur la page de réservation). */
export function HideOnPaths({ prefixes, children }: { prefixes: string[]; children: React.ReactNode }) {
  const pathname = usePathname();
  // Sur un site client, l'adresse affichée est réécrite : on compare la fin du chemin.
  const hidden = prefixes.some(
    (prefix) => pathname === prefix || pathname.endsWith(prefix) || pathname.includes(`${prefix}/`),
  );
  return hidden ? null : <>{children}</>;
}
