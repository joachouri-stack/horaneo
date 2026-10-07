"use client";

import Image from "next/image";
import { useRef, type ReactNode } from "react";

/**
 * Vignette cliquable : la photo s'ouvre en grand, entière (sans recadrage),
 * par-dessus la page. On ferme d'un clic, avec le bouton ou la touche Échap.
 */
export function PhotoZoom({
  children,
  src,
  width,
  height,
  alt,
  openLabel,
  closeLabel,
  className,
}: {
  children: ReactNode;
  src: string;
  width: number;
  height: number;
  alt: string;
  openLabel: string;
  closeLabel: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={openLabel}
        className={`group relative isolate block w-full cursor-zoom-in overflow-hidden ${className ?? ""}`}
      >
        <span className="block overflow-hidden rounded-[inherit]">
          <span className="block transition-transform duration-500 group-hover:scale-[1.04]">{children}</span>
        </span>
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-site-bg/90 text-site-text shadow-md transition group-hover:scale-110"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2M11 8v6M8 11h6" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <dialog
        ref={dialog}
        onClick={() => dialog.current?.close()}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-black/85"
      >
        <div className="flex h-dvh w-screen items-center justify-center p-4 sm:p-10">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes="100vw"
            className="h-auto max-h-full w-auto max-w-full cursor-zoom-out rounded-2xl object-contain shadow-2xl"
          />
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label={closeLabel}
          className="fixed right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition hover:bg-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </dialog>
    </>
  );
}
