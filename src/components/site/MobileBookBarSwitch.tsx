"use client";

import { usePathname } from "next/navigation";
import { BookButton } from "./BookButton";

export type BookBarVariant = {
  phone: { href: string; label: string; ariaLabel: string } | null;
  cta: { href: string; label: string };
};

/** Choisit la barre du bas selon la page affichée (page d'une professionnelle ou reste du site). */
export function MobileBookBarSwitch({
  mode,
  fallback,
  pages,
  hiddenOn,
}: {
  mode: "call" | "sms";
  fallback: BookBarVariant | null;
  pages: { path: string; variant: BookBarVariant }[];
  hiddenOn: string[];
}) {
  const pathname = usePathname();
  // Sur un site client, l'adresse affichée est réécrite : on compare la fin du chemin.
  const matches = (prefix: string) =>
    pathname === prefix || pathname.endsWith(prefix) || pathname.includes(`${prefix}/`);
  if (hiddenOn.some(matches)) return null;
  const bar =
    pages.find((page) => pathname === page.path || pathname.endsWith(page.path))?.variant ?? fallback;
  if (!bar) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-site-border bg-site-bg/95 px-4 py-3 backdrop-blur sm:hidden">
      <div className="flex gap-3">
        {bar.phone && (
          <a
            href={bar.phone.href}
            aria-label={bar.phone.ariaLabel}
            className="flex min-h-12 items-center justify-center rounded-site border border-site-border px-4 font-semibold text-site-text"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mr-2 h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {mode === "sms" ? (
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              ) : (
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              )}
            </svg>
            {bar.phone.label}
          </a>
        )}
        <BookButton href={bar.cta.href} label={bar.cta.label} size="md" className="flex-1" />
      </div>
    </div>
  );
}
