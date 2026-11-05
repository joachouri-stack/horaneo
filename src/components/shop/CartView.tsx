"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { viewCartAction, type CartView as CartData } from "@/app/(tenant)/sites/[tenantId]/panier/actions";
import { useSiteError } from "@/components/booking/hooks";
import { formatMoney } from "@/lib/format";
import { SITE_PATHS } from "@/modules/site/paths";
import { removeItems, setQuantity, useCart, type Cart } from "./cart-store";

/**
 * Panier : les produits sont relus sur le serveur (prix, stock, encore en vente) à chaque
 * changement. `checkout` : la suite (coordonnées et paiement), quand le panier est prêt.
 */
export function CartView({
  locale,
  checkout,
}: {
  locale: string;
  checkout?: (cart: Cart, view: CartData) => ReactNode;
}) {
  const t = useTranslations("site.shop");
  const errorText = useSiteError();
  const cart = useCart();
  const [view, setView] = useState<CartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removedNotice, setRemovedNotice] = useState(false);
  const key = cart ? JSON.stringify(cart) : "";

  useEffect(() => {
    if (!cart) return;
    let cancelled = false;
    void viewCartAction(cart.businessId, cart.items).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setView(result.data);
      // Produits retirés de la vente : enlevés du panier, avec un message.
      if (result.data.removed.length > 0) {
        setRemovedNotice(true);
        removeItems(result.data.removed);
      }
    });
    return () => {
      cancelled = true;
    };
    // Relu seulement quand le contenu du panier change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!cart) {
    return (
      <div className="space-y-4">
        {removedNotice && <p role="status">{t("removedNotice")}</p>}
        <p className="text-lg">{t("cartEmpty")}</p>
        <Link
          href={SITE_PATHS.shop}
          className="inline-flex min-h-12 items-center rounded-site bg-site-button px-6 font-semibold text-site-on-button"
        >
          {t("browse")}
        </Link>
      </div>
    );
  }
  if (error) return <p role="alert">{errorText(error)}</p>;
  if (!view) return <p aria-live="polite">{t("loading")}</p>;
  const money = (cents: number) => formatMoney(cents, view.currency ?? "EUR", locale);
  const step =
    "inline-flex size-10 items-center justify-center rounded-full border border-site-border text-lg font-semibold disabled:opacity-40";

  return (
    <div className="space-y-6">
      {removedNotice && <p role="status">{t("removedNotice")}</p>}
      <ul className="divide-y divide-site-border rounded-site border border-site-border bg-site-card">
        {view.lines.map((line) => (
          <li key={line.key} className="flex gap-4 p-4">
            <Link href={line.href} className="size-20 shrink-0 overflow-hidden rounded-site bg-site-panel">
              {line.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.photoUrl} alt="" className="h-full w-full object-cover" />
              )}
            </Link>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <Link href={line.href} className="font-semibold text-site-heading hover:underline">
                  {line.name}
                </Link>
                <span className="font-semibold tabular-nums">{money(line.totalCents)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="flex items-center gap-2"
                  role="group"
                  aria-label={`${t("quantity")} · ${line.name}`}
                >
                  <button
                    type="button"
                    className={step}
                    onClick={() => setQuantity(line.key, line.quantity - 1)}
                    aria-label={t("less")}
                  >
                    −
                  </button>
                  <span className="min-w-6 text-center tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    className={step}
                    onClick={() => setQuantity(line.key, line.quantity + 1)}
                    disabled={line.available !== null && line.quantity >= line.available}
                    aria-label={t("more")}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setQuantity(line.key, 0)}
                  className="min-h-11 text-site-muted underline underline-offset-4"
                >
                  {t("remove")}
                </button>
              </div>
              {!line.ok && (
                <p role="alert" className="font-semibold text-red-700">
                  {t("lineStock", { count: line.available ?? 0 })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="flex items-center justify-between text-xl font-semibold">
        <span>{t(view.fulfillment.delivery ? "subtotal" : "total")}</span>
        <span className="tabular-nums">{money(view.totalCents)}</span>
      </p>
      {view.ready && checkout?.(cart, view)}
    </div>
  );
}
