"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const TABS = [
  { key: "today", path: "", icon: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" },
  {
    key: "agenda",
    path: "/agenda",
    icon: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
  },
  {
    key: "customers",
    path: "/clientes",
    icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 19v-1a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75",
  },
  { key: "site", path: "/site", icon: "M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" },
  { key: "more", path: "/plus", icon: "M5 12h.01M12 12h.01M19 12h.01" },
] as const;

/**
 * Les 5 onglets de l'espace gérante : barre fixe en bas sur téléphone
 * (gros boutons, à portée de pouce), en haut sur ordinateur.
 */
export function ManagerTabs({ tenantId }: { tenantId: string }) {
  const t = useTranslations("manager.tabs");
  const pathname = usePathname();
  const base = `/espace/${tenantId}`;
  const isActive = (path: string) =>
    path === "" ? pathname === base : pathname.startsWith(`${base}${path}`);
  return (
    <nav
      aria-label={t("today")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-navy/10 bg-white pb-[env(safe-area-inset-bottom)] md:static md:border-b md:border-t-0 md:bg-transparent md:pb-0"
    >
      <ul className="mx-auto grid max-w-3xl grid-cols-5">
        {TABS.map((tab) => (
          <li key={tab.key}>
            <Link
              href={`${base}${tab.path}`}
              aria-current={isActive(tab.path) ? "page" : undefined}
              className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-navy/60 aria-[current=page]:text-coral-dark md:min-h-12 md:flex-row md:gap-2 md:text-sm md:aria-[current=page]:border-b-4 md:aria-[current=page]:border-coral"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-6 w-6 md:h-5 md:w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={tab.icon} />
              </svg>
              {t(tab.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
