"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/admin", key: "home", exact: true },
  { href: "/admin/clients", key: "clients", exact: false },
  { href: "/admin/clients/nouveau", key: "newClient", exact: true },
  { href: "/admin/commandes", key: "orders", exact: false },
  { href: "/admin/demandes", key: "requests", exact: false },
  { href: "/admin/paiements", key: "billing", exact: false },
  { href: "/admin/packs", key: "plans", exact: false },
  { href: "/admin/options", key: "options", exact: false },
  { href: "/admin/offres", key: "launchOffers", exact: false },
  { href: "/admin/reglages", key: "settings", exact: false },
  { href: "/admin/documents", key: "documents", exact: false },
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
    item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href) && pathname !== "/admin/clients/nouveau";
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
