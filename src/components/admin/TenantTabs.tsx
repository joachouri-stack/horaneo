"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export const TENANT_SECTIONS = [
  "coordonnees",
  "entreprises",
  "modele",
  "logo",
  "prestations",
  "equipe",
  "horaires",
  "pages",
  "photos",
  "temoignages",
  "apercu",
] as const;
export type TenantSection = (typeof TENANT_SECTIONS)[number];

/** Onglets de la fiche d'un client. */
export function TenantTabs({ tenantId }: { tenantId: string }) {
  const t = useTranslations("admin.tenant.tabs");
  const pathname = usePathname();
  const base = `/admin/clients/${tenantId}`;
  const items = [
    { href: base, label: t("overview") },
    ...TENANT_SECTIONS.map((section) => ({ href: `${base}/${section}`, label: t(section) })),
  ];
  return (
    <nav aria-label={t("overview")} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className="inline-block whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-night hover:bg-navy/5 aria-[current=page]:bg-navy aria-[current=page]:text-white"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
