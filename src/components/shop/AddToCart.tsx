"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SITE_PATHS } from "@/modules/site/paths";
import { addToCart, conflictsWith } from "./cart-store";

/** Quantité et bouton « Ajouter au panier » d'une fiche produit. */
export function AddToCart({
  businessId,
  productId,
  variantId = null,
  max,
}: {
  businessId: string;
  productId: string;
  /** Variante choisie (produit à variantes). */
  variantId?: string | null;
  /** Quantité maximale (stock restant, plafonnée). */
  max: number;
}) {
  const t = useTranslations("site.shop");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  if (max < 1) return <p className="text-lg font-semibold text-site-muted">{t("outOfStock")}</p>;
  const add = () => {
    // Le panier ne contient qu'une entreprise : le changer demande confirmation.
    if (conflictsWith(businessId) && !window.confirm(t("replaceCart"))) return;
    addToCart(businessId, productId, variantId, quantity, max);
    setAdded(true);
  };
  const step =
    "inline-flex size-11 items-center justify-center rounded-full border border-site-border text-xl font-semibold disabled:opacity-40";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3" role="group" aria-label={t("quantity")}>
        <button
          type="button"
          className={step}
          onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          disabled={quantity <= 1}
          aria-label={t("less")}
        >
          −
        </button>
        <span className="min-w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
          {quantity}
        </span>
        <button
          type="button"
          className={step}
          onClick={() => setQuantity((value) => Math.min(max, value + 1))}
          disabled={quantity >= max}
          aria-label={t("more")}
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={add}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-site bg-site-button px-6 text-lg font-semibold text-site-on-button transition hover:opacity-90 sm:w-auto"
      >
        {t("addToCart")}
      </button>
      {added && (
        <p role="status" className="text-site-text">
          {t("added")}{" "}
          <Link
            href={SITE_PATHS.cart}
            className="font-semibold text-site-accent underline underline-offset-4"
          >
            {t("seeCart")}
          </Link>
        </p>
      )}
    </div>
  );
}
