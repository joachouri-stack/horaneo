"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import { AddToCart } from "./AddToCart";

type Variant = { id: string; name: string; priceCents: number; stockQuantity: number | null };

/** Choix de la variante (taille, couleur…), son prix, puis l'ajout au panier. */
export function ProductBuy({
  businessId,
  productId,
  variants,
  currency,
  locale,
  maxQuantity,
}: {
  businessId: string;
  productId: string;
  variants: Variant[];
  currency: string;
  locale: string;
  maxQuantity: number;
}) {
  const t = useTranslations("site.shop");
  // Première variante disponible choisie d'avance.
  const [chosen, setChosen] = useState(
    () => variants.find((variant) => variant.stockQuantity !== 0)?.id ?? variants[0]?.id,
  );
  const variant = variants.find((item) => item.id === chosen) ?? variants[0];
  if (!variant) return null;
  const max = Math.min(variant.stockQuantity ?? maxQuantity, maxQuantity);
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 font-semibold">{t("variant")}</legend>
        <div className="flex flex-wrap gap-2">
          {variants.map((item) => {
            const out = item.stockQuantity === 0;
            return (
              <label
                key={item.id}
                className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 font-semibold has-[:checked]:border-site-button has-[:checked]:bg-site-button has-[:checked]:text-site-on-button has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-site-accent ${out ? "border-dashed border-site-border text-site-muted" : "border-site-border"}`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={item.id}
                  checked={item.id === variant.id}
                  onChange={() => setChosen(item.id)}
                  className="sr-only"
                />
                {item.name}
                {out && <span className="text-sm font-normal">· {t("outOfStockShort")}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="text-2xl text-site-text" aria-live="polite">
        {formatMoney(variant.priceCents, currency, locale)}
      </p>
      {variant.stockQuantity !== null && variant.stockQuantity > 0 && variant.stockQuantity <= 5 && (
        <p className="font-semibold text-site-accent">{t("fewLeft", { count: variant.stockQuantity })}</p>
      )}
      <AddToCart
        key={variant.id}
        businessId={businessId}
        productId={productId}
        variantId={variant.id}
        max={max}
      />
    </div>
  );
}
