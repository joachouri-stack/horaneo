"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Bandeau d'en-tête du site commercial : reste en haut de l'écran pendant le
 * défilement (fine ombre dès qu'on a quitté le haut de page) et, sur téléphone
 * et tablette, ouvre un menu avec les sections de l'accueil.
 */
export function HeaderShell({
  children,
  menu,
}: {
  children: ReactNode;
  menu?: {
    items: { hash: string; label: string }[];
    cta: string;
    open: string;
    close: string;
  };
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <div
      data-scrolled={scrolled}
      className={`group/hdr sticky top-0 z-40 bg-white/90 backdrop-blur-md transition-shadow duration-300 ${
        scrolled || open ? "shadow-[0_1px_0_#e6e9f0,0_8px_24px_rgba(15,24,48,.05)]" : ""
      }`}
    >
      <div className="relative">
        {children}
        {menu && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="menu-accueil"
            aria-label={open ? menu.close : menu.open}
            onClick={() => setOpen((value) => !value)}
            className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-line bg-white text-night lg:hidden"
          >
            <span aria-hidden="true" className="relative block h-3 w-4">
              <span
                className={`absolute left-0 h-0.5 w-4 rounded bg-current transition-transform duration-300 ${open ? "top-[5px] rotate-45" : "top-0"}`}
              />
              <span
                className={`absolute left-0 top-[5px] h-0.5 w-4 rounded bg-current transition-opacity ${open ? "opacity-0" : ""}`}
              />
              <span
                className={`absolute left-0 h-0.5 w-4 rounded bg-current transition-transform duration-300 ${open ? "top-[5px] -rotate-45" : "top-[10px]"}`}
              />
            </span>
          </button>
        )}
      </div>
      {menu && (
        <nav
          id="menu-accueil"
          aria-label={menu.open}
          // Menu fermé : ni lu par les lecteurs d'écran, ni atteint au clavier.
          inert={!open}
          className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out lg:hidden ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
        >
          <div className="min-h-0">
            <ul className="mx-auto flex max-w-[75rem] flex-col gap-1 px-4 pb-5 sm:px-6">
              {menu.items.map((item) => (
                <li key={item.hash}>
                  <Link
                    href={{ pathname: "/", hash: item.hash }}
                    onClick={() => setOpen(false)}
                    tabIndex={open ? undefined : -1}
                    className="flex min-h-12 items-center rounded-2xl px-3 text-[1.1875rem] font-medium text-night hover:bg-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="pt-2">
                <Link
                  href="/commander"
                  onClick={() => setOpen(false)}
                  tabIndex={open ? undefined : -1}
                  className="flex min-h-12 items-center justify-center rounded-xl bg-navy px-6 font-medium text-white"
                >
                  {menu.cta}
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      )}
    </div>
  );
}
