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

/**
 * Description pour Google : celle saisie dans l'admin, sinon l'accroche et le
 * texte d'introduction de l'accueil, coupés proprement vers 160 caractères
 * (jamais au milieu d'un mot ni sur une virgule).
 */
export function homeDescription(
  home: { seoDescription: string; texts: Record<string, string> } | undefined,
  max = 160,
): string | undefined {
  if (!home) return undefined;
  if (home.seoDescription) return home.seoDescription;
  const sentence = (value: string | undefined) => {
    const trimmed = value?.trim().replace(/\s+/g, " ");
    if (!trimmed) return "";
    return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed.replace(/[,;:]$/, "")}.`;
  };
  const { tagline, taglineAccent, intro } = home.texts;
  const lead = [tagline, taglineAccent].filter(Boolean).join(" ");
  const full = [sentence(lead), sentence(intro)].filter(Boolean).join(" ");
  if (!full) return undefined;
  if (full.length <= max) return full;
  const cut = full.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.]+$/, "")}…`;
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
    // Page de chaque professionnelle (modèle Atelier).
    if (site.tenant.templateKey === "atelier")
      list.push(...site.businesses.filter((b) => b.slug).map((b) => `/avec/${b.slug}`));
    if (sections.about) list.push(paths.about);
    if (sections.gallery) list.push(paths.gallery);
    if (sections.testimonials) list.push(paths.testimonials);
    list.push(paths.practical);
  }
  list.push(paths.legal, paths.privacy);
  if (paths.cancellation) list.push(paths.cancellation);
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
