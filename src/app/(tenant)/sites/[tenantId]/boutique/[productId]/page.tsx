import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { AddToCart } from "@/components/shop/AddToCart";
import { ProductBuy } from "@/components/shop/ProductBuy";
import { SiteImage } from "@/components/site/SiteImage";
import { withTenant } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { formatMoney } from "@/lib/format";
import { getSite } from "@/lib/site/load";
import { AppError } from "@/modules/errors";
import { MAX_QUANTITY, shopProduct } from "@/modules/shop/catalog";
import { productPath, SITE_PATHS } from "@/modules/site/paths";

const UUID = /^[0-9a-f-]{36}$/i;

/** Produit en vente chez l'une des entreprises dont la boutique est ouverte (sinon 404). */
const loadProduct = cache(async (tenantId: string, productId: string) => {
  if (!UUID.test(productId)) notFound();
  const site = await getSite(tenantId);
  const locale = resolveLocale(site.locale);
  for (const businessId of site.shopBusinessIds) {
    const product = await withTenant(
      tenantId,
      (tx) =>
        shopProduct(tx, tenantId, businessId, productId, locale).catch((error) => {
          if (error instanceof AppError && error.code === "not_found") return null;
          throw error;
        }),
      undefined,
      businessId,
    );
    if (product) return { site, product };
  }
  notFound();
});

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/boutique/[productId]">): Promise<Metadata> {
  const { tenantId, productId } = await params;
  const { product } = await loadProduct(tenantId, productId);
  return {
    title: product.name,
    description: product.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: productPath(product.id) },
  };
}

/** Fiche d'un produit : photo, prix, description, stock et ajout au panier. */
export default async function ProductPage({ params }: PageProps<"/sites/[tenantId]/boutique/[productId]">) {
  const { tenantId, productId } = await params;
  const { site, product } = await loadProduct(tenantId, productId);
  const t = await getTranslations("site.shop");
  const max = Math.min(product.stockQuantity ?? MAX_QUANTITY, MAX_QUANTITY);
  const several = site.shopBusinessIds.length > 1;
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <Link
        href={several ? `${SITE_PATHS.shop}?avec=${product.businessId}` : SITE_PATHS.shop}
        className="mb-6 inline-flex min-h-11 items-center font-semibold text-site-accent underline-offset-4 hover:underline"
      >
        ← {t("back")}
      </Link>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="overflow-hidden rounded-site bg-site-panel">
          {product.photo ? (
            <SiteImage
              image={{ ...product.photo, alt: product.name }}
              sizes="(min-width: 768px) 50vw, 100vw"
              priority
              className="aspect-square h-auto w-full object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex aspect-square items-center justify-center text-site-muted"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5" />
              </svg>
            </div>
          )}
        </div>
        <div className="space-y-5">
          <h1 className="font-site-display text-4xl font-semibold text-site-heading">{product.name}</h1>
          {product.variants.length === 0 && (
            <p className="text-2xl text-site-text">
              {formatMoney(product.priceCents, product.currency, site.locale)}
            </p>
          )}
          {product.description && (
            <p className="whitespace-pre-line text-lg leading-relaxed text-site-muted">
              {product.description}
            </p>
          )}
          {product.variants.length > 0 ? (
            <ProductBuy
              businessId={product.businessId}
              productId={product.id}
              variants={product.variants}
              currency={product.currency}
              locale={site.locale}
              maxQuantity={MAX_QUANTITY}
            />
          ) : (
            <>
              {product.stockQuantity !== null && product.stockQuantity > 0 && product.stockQuantity <= 5 && (
                <p className="font-semibold text-site-accent">
                  {t("fewLeft", { count: product.stockQuantity })}
                </p>
              )}
              <AddToCart businessId={product.businessId} productId={product.id} max={max} />
            </>
          )}
          <p className="text-site-muted">
            {t("pickupNote", { mode: site.shopModes[product.businessId] ?? "pickup" })}
          </p>
        </div>
      </div>
    </main>
  );
}
