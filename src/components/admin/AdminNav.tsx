"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/admin", key: "home", exact: true },
  { href: "/admin/clients", key: "clients", exact: false },
  { href: "/admin/clients/nouveau", key: "newClient", exact: true },
  { href: "/admin/demandes", key: "requests", exact: false },
] as const;

/** Navigation principale de l'espace admin. */
export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  const isActive = (item: (typeof ITEMS)[number]) =>
    item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href) && pathname !== "/admin/clients/nouveau";
  return (
    <nav aria-label="Admin" className="mx-auto max-w-6xl overflow-x-auto px-4">
      <ul className="flex gap-2 border-b border-navy/10">
        {ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item) ? "page" : undefined}
              className="inline-block whitespace-nowrap border-b-4 border-transparent px-3 py-3 font-semibold text-navy/70 hover:text-navy aria-[current=page]:border-coral aria-[current=page]:text-navy"
            >
              {t(item.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
