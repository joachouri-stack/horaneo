"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { SITE_PATHS } from "@/modules/site/paths";
import { cartCount, useCart } from "./cart-store";

/** Panier dans l'en-tête (boutique ouverte) : bouton rond avec le nombre d'articles. */
export function CartLink() {
  const t = useTranslations("site.shop");
  const count = cartCount(useCart());
  return (
    <Link
      href={SITE_PATHS.cart}
      aria-label={t("cartCount", { count })}
      title={t("cart")}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-site-border text-site-text transition hover:border-site-accent hover:text-site-accent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-site-button px-1 text-xs font-semibold text-site-on-button tabular-nums">
          {count}
        </span>
      )}
    </Link>
  );
}
