import { publicAppUrl } from "@/config/env";

/** Le site commercial est indexé ; les espaces privés ne le sont pas. */
export function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /*/espace",
    "Disallow: /*/admin",
    "Disallow: /*/connexion",
    "Disallow: /*/commander",
    "Disallow: /api/",
    `Sitemap: ${publicAppUrl()}/sitemap.xml`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
