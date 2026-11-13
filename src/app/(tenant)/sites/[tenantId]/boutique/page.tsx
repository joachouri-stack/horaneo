import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { SiteImage } from "@/components/site/SiteImage";
import { withTenant } from "@/db/access";
import { resolveLocale } from "@/i18n/translator";
import { formatMoney } from "@/lib/format";
import { getSite } from "@/lib/site/load";
import { priceRange, promotion, shopProducts, soldOut } from "@/modules/shop/catalog";
import { productPath, SITE_PATHS } from "@/modules/site/paths";

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/boutique">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const tSeo = await getTranslations({ locale: site.locale, namespace: "site.seo" });
  const t = await getTranslations({ locale: site.locale, namespace: "site.shop" });
  return {
    title: t("title"),
    description: tSeo("shop", { name: site.tenant.name }),
    alternates: { canonical: SITE_PATHS.shop },
  };
}

/**
 * Boutique : produits en vente. Sur un site à plusieurs entreprises, on choisit d'abord
 * chez qui (chaque entreprise encaisse ses propres ventes).
 */
export default async function ShopPage({ params, searchParams }: PageProps<"/sites/[tenantId]/boutique">) {
  const { tenantId } = await params;
  const query = await searchParams;
  const site = await getSite(tenantId);
  const sellers = site.businesses.filter((business) => site.shopBusinessIds.includes(business.id));
  if (sellers.length === 0) notFound();
  const chosen = sellers.length === 1 ? sellers[0] : sellers.find((business) => business.id === query.avec);
  const t = await getTranslations("site.shop");
  const locale = resolveLocale(site.locale);
  // Retrait, livraison ou les deux : chez l'entreprise choisie, sinon sur l'ensemble du site.
  const modes = new Set(
    (chosen ? [chosen] : sellers).map((business) => site.shopModes[business.id] ?? "pickup"),
  );
  const mode = modes.size === 1 ? [...modes][0] : "both";
  const products = chosen
    ? await withTenant(tenantId, (tx) => shopProducts(tx, tenantId, chosen.id, locale), undefined, chosen.id)
    : [];

  // Regroupement par catégorie (dans l'ordre des produits) ; les produits sans catégorie à la fin.
  const named = [
    ...new Set(products.map((product) => product.category).filter((c): c is string => Boolean(c))),
  ];
  const groups = [
    ...named.map((name, index) => ({
      name,
      anchor: `categorie-${index + 1}`,
      products: products.filter((product) => product.category === name),
    })),
    {
      name: t("otherCategory"),
      anchor: "autres",
      products: products.filter((product) => !product.category),
    },
  ].filter((group) => group.products.length > 0);
  const grid = (list: typeof products) => (
    <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
      {list.map((product) => {
        const out = soldOut(product);
        const price = priceRange(product);
        const promo = promotion(product);
        const money = (cents: number) => formatMoney(cents, product.currency, site.locale);
        return (
          <li key={product.id}>
            <Link
              href={productPath(product.id)}
              className="group flex h-full flex-col overflow-hidden rounded-site border border-site-border bg-site-card transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="relative block aspect-square overflow-hidden bg-site-panel">
                {product.photo ? (
                  <SiteImage
                    image={{ ...product.photo, alt: product.name }}
                    sizes="(min-width: 1024px) 33vw, 50vw"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-full items-center justify-center text-site-muted"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5" />
                    </svg>
                  </span>
                )}
                {out ? (
                  <span className="absolute left-3 top-3 rounded-full bg-site-bg/90 px-3 py-1 text-sm font-semibold">
                    {t("outOfStock")}
                  </span>
                ) : (
                  (promo || product.isNew) && (
                    <span className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
                      {product.isNew && (
                        <span className="rounded-full bg-site-bg/90 px-3 py-1 text-sm font-semibold text-site-heading">
                          {t("new")}
                        </span>
                      )}
                      {promo && (
                        <span className="rounded-full bg-site-button px-3 py-1 text-sm font-semibold text-site-on-button">
                          {t("discount", { percent: promo.percent })}
                        </span>
                      )}
                    </span>
                  )
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1 p-4">
                <span className="font-site-display text-lg font-semibold leading-snug text-site-heading">
                  {product.name}
                </span>
                <span className="mt-auto text-lg text-site-text">
                  {price.varies ? t("fromPrice", { price: money(price.min) }) : money(price.min)}
                  {promo && (
                    <>
                      {" "}
                      <s className="text-base text-site-muted">
                        <span className="sr-only">{t("insteadOf")} </span>
                        {money(promo.compareAtPriceCents)}
                      </s>
                    </>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={t("title")} intro={t("intro", { mode })} />
      {sellers.length > 1 && (
        <nav aria-label={t("who")} className="mb-8">
          <p className="mb-3 text-lg font-semibold">{t("who")}</p>
          <ul className="flex flex-wrap gap-2">
            {sellers.map((business) => (
              <li key={business.id}>
                <Link
                  href={`${SITE_PATHS.shop}?avec=${business.id}`}
                  aria-current={chosen?.id === business.id ? "true" : undefined}
                  className="inline-flex min-h-12 items-center rounded-full border border-site-border bg-site-card px-5 font-semibold aria-[current=true]:border-site-button aria-[current=true]:bg-site-button aria-[current=true]:text-site-on-button"
                >
                  {business.title ? `${business.title} · ${business.name}` : business.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {chosen && groups.length > 1 && (
        <nav aria-label={t("categories")} className="mb-8">
          <ul className="flex flex-wrap gap-2">
            {groups.map((group) => (
              <li key={group.anchor}>
                <a
                  href={`#${group.anchor}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-site-border bg-site-card px-4 font-semibold hover:border-site-accent"
                >
                  {group.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {chosen &&
        groups.map((group) => (
          <section
            key={group.anchor}
            id={group.anchor}
            aria-label={group.name}
            className="mb-12 scroll-mt-28"
          >
            {groups.length > 1 && (
              <h2 className="mb-5 font-site-display text-3xl font-semibold text-site-heading">
                {group.name}
              </h2>
            )}
            {grid(group.products)}
          </section>
        ))}
    </main>
  );
}
