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
  const pill =
    "inline-block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-night hover:bg-navy/5 aria-[current=page]:bg-navy aria-[current=page]:text-white";
  return (
    <nav aria-label={t("overview")} className="space-y-2">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4">
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
        <ul className="-mx-4 flex gap-1 overflow-x-auto border-t border-navy/10 px-4 pt-2">
          {current.sections.map((section) => (
            <li key={section}>
              <Link
                href={href(section)}
                aria-current={pathname === href(section) ? "page" : undefined}
                className="inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-night/80 hover:bg-navy/5 aria-[current=page]:bg-blush aria-[current=page]:text-coral-dark"
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
