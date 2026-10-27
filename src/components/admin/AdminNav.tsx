"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Six entrées : chaque entrée couvre une ou plusieurs pages (`paths`), reliées
 * entre elles par des sous-onglets (voir AdminSubNav).
 */
const ITEMS = [
  { href: "/admin", key: "home", paths: [] },
  { href: "/admin/commandes", key: "todo", paths: ["/admin/commandes", "/admin/demandes"] },
  { href: "/admin/clients", key: "clients", paths: ["/admin/clients"] },
  { href: "/admin/paiements", key: "billing", paths: ["/admin/paiements"] },
  { href: "/admin/packs", key: "plans", paths: ["/admin/packs", "/admin/options", "/admin/offres"] },
  { href: "/admin/reglages", key: "settings", paths: ["/admin/reglages", "/admin/documents"] },
] as const;

/** Navigation principale de l'espace admin. */
export function AdminNav({
  badges = {},
}: {
  badges?: Partial<Record<(typeof ITEMS)[number]["key"], number>>;
}) {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const isActive = (item: (typeof ITEMS)[number]) =>
    item.paths.length === 0 ? pathname === item.href : item.paths.some((path) => pathname.startsWith(path));
  return (
    // Sur téléphone, les six entrées tiennent sur deux lignes de trois : aucune n'est cachée.
    <nav aria-label={t("label")} className="mx-auto max-w-6xl px-4">
      <ul className="grid grid-cols-3 gap-x-1 border-b border-navy/10 sm:flex sm:gap-2">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className="flex min-h-11 items-center justify-center whitespace-nowrap border-b-4 border-transparent px-2 py-2 text-[0.9375rem] font-semibold text-navy/70 hover:text-night aria-[current=page]:border-coral aria-[current=page]:text-night sm:px-3 sm:py-3 sm:text-base"
            >
              {t(item.key)}
              {(badges[item.key] ?? 0) > 0 && (
                <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-coral px-1.5 text-xs font-bold leading-5 text-white">
                  <span aria-hidden="true">{badges[item.key]}</span>
                  <span className="sr-only">{t("waiting", { count: badges[item.key] ?? 0 })}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
