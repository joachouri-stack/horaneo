import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ShopCart } from "@/components/shop/ShopCart";
import { PageTitle } from "@/components/site/blocks";
import { getSite } from "@/lib/site/load";

export async function generateMetadata({ params }: PageProps<"/sites/[tenantId]/panier">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.shop" });
  // Panier : propre à chaque visiteur, jamais indexé.
  return { title: t("cartTitle"), robots: { index: false, follow: false } };
}

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CartPage({ params, searchParams }: PageProps<"/sites/[tenantId]/panier">) {
  const site = await getSite((await params).tenantId);
  const query = await searchParams;
  if (site.shopBusinessIds.length === 0) notFound();
  const t = await getTranslations("site.shop");
  return (
    <main id="contenu" className="mx-auto max-w-3xl px-4 py-12">
      <PageTitle title={t("cartTitle")} />
      <ShopCart
        locale={site.locale}
        businessNames={Object.fromEntries(
          site.businesses
            .filter((business) => site.shopBusinessIds.includes(business.id))
            .map((business) => [business.id, business.shopName || business.name]),
        )}
        returned={
          typeof query.commande === "string" &&
          typeof query.avec === "string" &&
          UUID.test(query.commande) &&
          UUID.test(query.avec)
            ? { orderId: query.commande, businessId: query.avec }
            : null
        }
      />
    </main>
  );
}
