import type { SiteData } from "./data";

type Site = NonNullable<SiteData>;

const SCHEMA_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Fiche « établissement local » pour Google (données structurées schema.org) :
 * nom, adresse, téléphone, horaires, coordonnées. Type générique LocalBusiness :
 * aucune règle selon le métier.
 */
export function localBusinessJsonLd(site: Site, url: string, imageUrl: string | null) {
  const { tenant } = site;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: tenant.name,
    url,
    ...(imageUrl ? { image: imageUrl, logo: imageUrl } : {}),
    ...(tenant.phone ? { telephone: tenant.phone } : {}),
    ...(tenant.email ? { email: tenant.email } : {}),
    ...(tenant.address || tenant.city
      ? {
          address: {
            "@type": "PostalAddress",
            ...(tenant.address ? { streetAddress: tenant.address } : {}),
            ...(tenant.postalCode ? { postalCode: tenant.postalCode } : {}),
            ...(tenant.city ? { addressLocality: tenant.city } : {}),
            addressCountry: tenant.country,
          },
        }
      : {}),
    ...(tenant.latitude !== null && tenant.longitude !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: tenant.latitude, longitude: tenant.longitude } }
      : {}),
    ...(site.openingHours.length > 0
      ? {
          openingHoursSpecification: site.openingHours.map((range) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: SCHEMA_DAYS[range.weekday - 1],
            opens: range.opensAt,
            closes: range.closesAt,
          })),
        }
      : {}),
  };
}

/** Insertion sûre du JSON dans une balise <script> (aucune fermeture de balise possible). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Pages publiques d'un site (pour le plan du site envoyé à Google). */
export function sitemapPaths(
  site: Site,
  sections: Record<string, boolean>,
  paths: Record<string, string>,
  categoryPath: (slug: string) => string,
) {
  const list = [paths.home];
  if (site.features.fullSite) {
    if (sections.services)
      list.push(paths.services, ...site.categories.map((category) => categoryPath(category.slug)));
    if (sections.about) list.push(paths.about);
    if (sections.gallery) list.push(paths.gallery);
    if (sections.testimonials) list.push(paths.testimonials);
    list.push(paths.practical);
  }
  list.push(paths.legal, paths.privacy);
  return list;
}

export function renderSitemap(baseUrl: string, paths: string[], lastModified: Date): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const urls = paths
    .map(
      (path) =>
        `  <url><loc>${escape(`${baseUrl}${path === "/" ? "" : path}`)}</loc><lastmod>${lastModified.toISOString()}</lastmod></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
