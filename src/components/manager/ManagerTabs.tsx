"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ICONS = {
  today: "M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  agenda: "M8 3v4M16 3v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2",
  customers:
    "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 19v-1a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75",
  site: "M3 5h18v12H3zM8 21h8M12 17v4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  stats: "M4 20h16M7 16.5v-4M11.5 16.5V8M16 16.5v-6.5",
  team: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  payments: "M3 6h18v12H3zM3 10h18M7 15h3",
  subscription: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 15.5h5",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4",
} as const;

const MAIN = [
  { key: "today", path: "" },
  { key: "agenda", path: "/agenda" },
  { key: "customers", path: "/clientes" },
  { key: "site", path: "/site" },
  { key: "more", path: "/plus" },
] as const;

/** Raccourcis de la barre latérale (ordinateur) vers les pages de « Plus ». */
const SECONDARY = [
  { key: "stats", path: "/plus/statistiques" },
  { key: "team", path: "/plus/equipe" },
  { key: "payments", path: "/plus/paiements" },
  { key: "subscription", path: "/plus/abonnement" },
  { key: "settings", path: "/plus/reglages" },
] as const;

function Icon({ d, className }: { d: string; className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Navigation de l'espace gérante : barre fixe en bas sur téléphone (à portée
 * de pouce), barre latérale sur ordinateur avec les raccourcis de « Plus » et
 * le lien vers le site.
 */
export function ManagerTabs({
  tenantId,
  siteUrl,
  siteLabel,
}: {
  tenantId: string;
  siteUrl: string | null;
  siteLabel: string;
}) {
  const t = useTranslations("manager.tabs");
  const tMore = useTranslations("manager.more");
  const pathname = usePathname();
  const base = `/espace/${tenantId}`;
  const isActive = (path: string) =>
    path === ""
      ? pathname === base
      : path === "/plus"
        ? pathname === `${base}/plus`
        : pathname.startsWith(`${base}${path}`);
  const sideLink =
    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium text-ink-soft transition hover:bg-white hover:text-night aria-[current=page]:bg-white aria-[current=page]:text-accent aria-[current=page]:shadow-[0_1px_2px_rgba(15,24,48,.06)]";

  return (
    <>
      {/* Téléphone et tablette : 5 onglets en bas. */}
      <nav
        aria-label={t("nav")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {MAIN.map((tab) => (
            <li key={tab.key}>
              <Link
                href={`${base}${tab.path}`}
                aria-current={isActive(tab.path) ? "page" : undefined}
                className="group flex min-h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-medium text-ink-soft aria-[current=page]:text-accent"
              >
                <span className="flex h-7 w-12 items-center justify-center rounded-full transition group-aria-[current=page]:bg-accent-soft">
                  <Icon d={ICONS[tab.key]} className="h-[22px] w-[22px]" />
                </span>
                {t(tab.key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Ordinateur : barre latérale. */}
      <nav
        aria-label={t("nav")}
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-hairline bg-mist-50 px-4 py-6 lg:flex"
      >
        <ul className="space-y-1">
          {MAIN.filter((tab) => tab.key !== "more").map((tab) => (
            <li key={tab.key}>
              <Link
                href={`${base}${tab.path}`}
                aria-current={isActive(tab.path) ? "page" : undefined}
                className={sideLink}
              >
                <Icon d={ICONS[tab.key]} className="h-5 w-5 shrink-0" />
                {t(tab.key)}
              </Link>
            </li>
          ))}
        </ul>
        <div>
          <p className="px-3 pb-2 text-[0.72rem] font-medium uppercase tracking-[0.08em] text-ink-soft/80">
            {t("more")}
          </p>
          <ul className="space-y-1">
            {SECONDARY.map((item) => (
              <li key={item.key}>
                <Link
                  href={`${base}${item.path}`}
                  aria-current={isActive(item.path) ? "page" : undefined}
                  className={sideLink}
                >
                  <Icon d={ICONS[item.key]} className="h-5 w-5 shrink-0" />
                  {tMore(item.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href={`${base}/plus`}
                aria-current={isActive("/plus") ? "page" : undefined}
                className={sideLink}
              >
                <Icon d={ICONS.more} className="h-5 w-5 shrink-0" />
                {t("allTools")}
              </Link>
            </li>
          </ul>
        </div>
        {siteUrl && (
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener"
            className="mt-auto flex items-center justify-between gap-2 rounded-2xl border border-hairline bg-white px-4 py-3 text-sm font-medium text-night transition hover:border-accent-line hover:text-accent"
          >
            {siteLabel}
            <Icon d="M7 17 17 7M9 7h8v8" className="h-4 w-4 shrink-0" />
          </a>
        )}
      </nav>
    </>
  );
}
