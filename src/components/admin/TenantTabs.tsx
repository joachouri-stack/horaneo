"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Cinq onglets pour la fiche d'un client ; un onglet qui regroupe plusieurs
 * pages affiche une seconde rangée de sous-onglets.
 */
const GROUPS = [
  { key: "overview", sections: [""] },
  { key: "info", sections: ["coordonnees", "entreprises"] },
  { key: "look", sections: ["modele", "logo", "photos"] },
  { key: "content", sections: ["prestations", "equipe", "horaires", "pages", "temoignages"] },
  { key: "preview", sections: ["apercu"] },
] as const;

export type TenantSection = Exclude<(typeof GROUPS)[number]["sections"][number], "">;

/** Onglets de la fiche d'un client. */
export function TenantTabs({ tenantId }: { tenantId: string }) {
  const t = useTranslations("admin.tenant.tabs");
  const pathname = usePathname();
  const base = `/admin/clients/${tenantId}`;
  const href = (section: string) => (section ? `${base}/${section}` : base);
  const current = GROUPS.find((group) => group.sections.some((section) => pathname === href(section)));
  // Un seul style pour l'onglet choisi, aux deux niveaux ; les onglets passent à la ligne
  // sur téléphone plutôt que de défiler (aucun n'est caché).
  const pill =
    "inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold text-night hover:bg-navy/5 aria-[current=page]:bg-navy aria-[current=page]:text-white aria-[current=page]:hover:bg-navy";
  return (
    <nav aria-label={t("overview")} className="space-y-2">
      <ul className="flex flex-wrap gap-1">
        {GROUPS.map((group) => (
          <li key={group.key}>
            <Link
              href={href(group.sections[0])}
              aria-current={current?.key === group.key ? "page" : undefined}
              className={pill}
            >
              {t(`groups.${group.key}`)}
            </Link>
          </li>
        ))}
      </ul>
      {current && current.sections.length > 1 && (
        <ul className="flex flex-wrap gap-1 border-t border-navy/10 pt-2">
          {current.sections.map((section) => (
            <li key={section}>
              <Link
                href={href(section)}
                aria-current={pathname === href(section) ? "page" : undefined}
                className={pill}
              >
                {t(section as TenantSection)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
