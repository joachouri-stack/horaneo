import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CartView } from "@/components/shop/CartView";
import { PageTitle } from "@/components/site/blocks";
import { getSite } from "@/lib/site/load";

export async function generateMetadata({ params }: PageProps<"/sites/[tenantId]/panier">): Promise<Metadata> {
  const site = await getSite((await params).tenantId);
  const t = await getTranslations({ locale: site.locale, namespace: "site.shop" });
  // Panier : propre à chaque visiteur, jamais indexé.
  return { title: t("cartTitle"), robots: { index: false, follow: false } };
}

export default async function CartPage({ params }: PageProps<"/sites/[tenantId]/panier">) {
  const site = await getSite((await params).tenantId);
  if (site.shopBusinessIds.length === 0) notFound();
  const t = await getTranslations("site.shop");
  return (
    <main id="contenu" className="mx-auto max-w-3xl px-4 py-12">
      <PageTitle title={t("cartTitle")} />
      <CartView locale={site.locale} />
    </main>
  );
}
