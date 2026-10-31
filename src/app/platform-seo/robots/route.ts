import { publicAppUrl } from "@/config/env";

/**
 * Le site commercial est indexé ; les espaces privés ne le sont pas. Connexion et commande
 * restent explorables : leur « noindex » doit pouvoir être lu par les moteurs de recherche.
 */
export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /*/espace",
    "Disallow: /*/admin",
    "Disallow: /api/",
    `Sitemap: ${publicAppUrl()}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
