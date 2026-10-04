import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/site/blocks";
import { ServiceList } from "@/components/site/ServiceList";
import { requireSection } from "@/lib/site/guards";
import { getSite } from "@/lib/site/load";
import { categoryPath } from "@/modules/site/paths";

async function load(params: PageProps<"/sites/[tenantId]/prestations/[slug]">["params"]) {
  const { tenantId, slug } = await params;
  const site = await getSite(tenantId);
  const category = site.categories.find((item) => item.slug === decodeURIComponent(slug));
  return { site, category };
}

export async function generateMetadata({
  params,
}: PageProps<"/sites/[tenantId]/prestations/[slug]">): Promise<Metadata> {
  const { site, category } = await load(params);
  if (!category) return {};
  const t = await getTranslations({ locale: site.locale, namespace: "site.services" });
  const city = site.tenant.city ?? "none";
  return {
    title: t("categoryMetaTitle", { category: category.name, city }),
    description:
      category.description ||
      t("categoryMetaDescription", { category: category.name, name: site.tenant.name, city }),
    alternates: { canonical: categoryPath(category.slug) },
  };
}

/** Page d'une catégorie de prestations (référencement local : « Massages à Lyon »). */
export default async function CategoryPage({ params }: PageProps<"/sites/[tenantId]/prestations/[slug]">) {
  const { site, category } = await load(params);
  requireSection(site, "services");
  if (!category) notFound();
  const t = await getTranslations("site.services");
  const others = site.categories.filter((item) => item.id !== category.id);
  const title = site.tenant.city
    ? t("categoryMetaTitle", { category: category.name, city: site.tenant.city })
    : category.name;
  return (
    <main id="contenu" className="mx-auto max-w-6xl px-4 py-12">
      <PageTitle title={title} intro={category.description} />
      <ServiceList categories={[]} uncategorized={category.services} locale={site.locale} />
      {others.length > 0 && (
        <nav aria-labelledby="autres" className="mt-12">
          <h2 id="autres" className="mb-4 font-site-display text-2xl font-semibold text-site-heading">
            {t("otherCategories")}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {others.map((item) => (
              <li key={item.id}>
                <Link
                  href={categoryPath(item.slug)}
                  className="inline-block rounded-site border border-site-border px-4 py-2 text-site-text hover:border-site-accent"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
