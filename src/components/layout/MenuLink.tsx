"use client";

import { Link } from "@/i18n/navigation";

/** Lien du menu mobile : referme le menu (popover) en allant à la section. */
export function MenuLink({
  popover,
  hash,
  children,
}: {
  popover: string;
  hash: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={{ pathname: "/", hash }}
      onClick={() => document.getElementById(popover)?.hidePopover()}
      className="block rounded-2xl px-4 py-3 hover:bg-blush"
    >
      {children}
    </Link>
  );
}
