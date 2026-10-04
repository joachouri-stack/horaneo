import { publicAppUrl } from "@/config/env";
import { ENABLED_LOCALES } from "@/i18n/enabled";

/** Plan du site commercial (accueil et documents légaux, dans chaque langue activée). */
export function GET() {
  const base = publicAppUrl();
  const paths = ["", "/mentions-legales", "/confidentialite", "/conditions"];
  const urls = ENABLED_LOCALES.flatMap((locale) =>
    paths.map((path) => `  <url><loc>${base}/${locale}${path}</loc></url>`),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}
