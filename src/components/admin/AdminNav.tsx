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
  { href: "/admin/packs", key: "plans", paths: ["/admin/packs"] },
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
    <nav aria-label={t("label")} className="mx-auto max-w-6xl overflow-x-auto px-4">
      <ul className="flex gap-2 border-b border-navy/10">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className="inline-block whitespace-nowrap border-b-4 border-transparent px-3 py-3 font-semibold text-navy/70 hover:text-night aria-[current=page]:border-coral aria-[current=page]:text-night"
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
