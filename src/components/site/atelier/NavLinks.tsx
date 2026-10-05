"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Partie « #… » de l'adresse en cours (mise à jour quand elle change). */
function useHash() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return [hash, setHash] as const;
}

/**
 * Menu de l'en-tête : la page en cours est soulignée. Un lien vers une
 * catégorie d'une page (ex. /avec/laila#formations) est souligné à la place
 * de la page elle-même quand c'est lui qui a été suivi.
 */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const [hash, setHash] = useHash();
  // Sur un site client, l'adresse interne est /sites/<id>/… : seule la fin compte.
  const onPath = (path: string) => pathname === path || pathname.endsWith(path);
  const parts = (href: string) => {
    const [path, anchor] = href.split("#");
    return { path, anchor: anchor ? `#${anchor}` : "" };
  };
  const anchorActive = links.some((link) => {
    const { path, anchor } = parts(link.href);
    return anchor && anchor === hash && onPath(path);
  });
  const current = (href: string) => {
    const { path, anchor } = parts(href);
    if (!onPath(path)) return false;
    return anchor ? anchor === hash : !anchorActive;
  };
  return (
    <ul className="flex items-center gap-4 text-sm font-medium xl:gap-7 xl:text-[0.95rem]">
      {links.map((link) => {
        const className =
          "relative whitespace-nowrap py-2 text-site-text after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-site-accent after:transition-transform hover:text-site-accent hover:after:scale-x-100 aria-[current=page]:text-site-accent aria-[current=page]:after:scale-x-100";
        const ariaCurrent = current(link.href) ? ("page" as const) : undefined;
        return (
          <li key={link.href}>
            {/* Lien vers une catégorie : lien classique, pour que la page s'ouvre sur elle. */}
            {link.href.includes("#") ? (
              <a href={link.href} aria-current={ariaCurrent} className={className}>
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                aria-current={ariaCurrent}
                className={className}
                onClick={() => setHash("")}
              >
                {link.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
