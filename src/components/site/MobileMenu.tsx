"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** Menu du site sur téléphone (bouton ☰). */
export function MobileMenu({
  links,
  hideFrom = "md",
}: {
  links: { href: string; label: string }[];
  /** Taille d'écran à partir de laquelle le menu complet remplace le bouton. */
  hideFrom?: "md" | "lg";
}) {
  const t = useTranslations("site");
  const [open, setOpen] = useState(false);
  if (links.length === 0) return null;
  return (
    <div className={hideFrom === "lg" ? "lg:hidden" : "md:hidden"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-mobile"
        onClick={() => setOpen(!open)}
        className="flex h-11 w-11 items-center justify-center rounded-site border border-site-border text-site-text"
      >
        <span className="sr-only">{open ? t("closeMenu") : t("menu")}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <nav
          id="menu-mobile"
          className="absolute inset-x-0 top-full border-b border-site-border bg-site-bg px-4 pb-4 shadow-lg"
        >
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block border-b border-site-border py-3 text-lg text-site-text"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
