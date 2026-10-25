"use client";

import { useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * Cloche de l'espace gérante, avec le nombre de notifications pas encore vues.
 * La pastille disparaît dès qu'on ouvre la page des notifications, et ne
 * revient que si le nombre change (nouvelle notification au prochain chargement).
 */
export function NotificationBell({ href, count, label }: { href: string; count: number; label: string }) {
  const pathname = usePathname();
  const [cleared, setCleared] = useState<number | null>(null);
  if (pathname === href && cleared !== count) setCleared(count);
  const shown = pathname === href || cleared === count ? 0 : count;
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={pathname === href ? "page" : undefined}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-navy transition hover:bg-accent-soft aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {shown > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 flex min-w-5 items-center justify-center rounded-full bg-coral px-1 text-xs font-semibold leading-5 text-white ring-2 ring-white"
        >
          {shown > 9 ? "9+" : shown}
        </span>
      )}
    </Link>
  );
}
