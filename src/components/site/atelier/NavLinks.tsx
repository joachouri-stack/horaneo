"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Menu de l'en-tête : la page en cours est soulignée. */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // Sur un site client, l'adresse interne est /sites/<id>/… : seule la fin compte.
  const current = (href: string) => pathname === href || pathname.endsWith(href);
  return (
    <ul className="flex items-center gap-4 text-sm font-medium xl:gap-7 xl:text-[0.95rem]">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            aria-current={current(link.href) ? "page" : undefined}
            className="relative whitespace-nowrap py-2 text-site-text after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-site-accent after:transition-transform hover:text-site-accent hover:after:scale-x-100 aria-[current=page]:text-site-accent aria-[current=page]:after:scale-x-100"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
