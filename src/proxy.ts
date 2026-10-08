import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { authSecret, env } from "@/config/env";
import { platformLocaleRedirect } from "@/i18n/redirects";
import { routing } from "@/i18n/routing";
import { classifyHost } from "@/lib/tenancy/hosts";
import { buildHostConfig, lookup } from "@/lib/tenancy/runtime";
import { PREVIEW_HEADER, SITES_PREFIX } from "@/lib/tenancy/paths";
import {
  PREVIEW_COOKIE,
  PREVIEW_PARAM,
  PREVIEW_TTL_SECONDS,
  verifyPreviewToken,
} from "@/lib/tenancy/preview";
import { routeTenantHost } from "@/lib/tenancy/resolve";

/**
 * Traite chaque requête selon son nom de domaine :
 * - horaneo.com            → site commercial (avec la langue dans l'adresse)
 * - horaneo.fr, www.…      → redirection
 * - nom.horaneo.com, domaine propre d'un client → site du client
 *   (réécrit en interne vers /sites/<identifiant du tenant>/…)
 */

const intl = createIntlMiddleware(routing);
const settings = env();
const isProduction = settings.NODE_ENV === "production";

const hostConfig = buildHostConfig();

const INTERNAL_PATHS: Record<string, string> = {
  "/sitemap.xml": "/seo/sitemap",
  "/robots.txt": "/seo/robots",
};

/** Adresses indépendantes du domaine (la tâche planifiée est protégée par son secret). */
const MACHINE_PATHS = ["/api/health", "/api/cron"];

function hasPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function notFound() {
  return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain" } });
}

/** Adresse du site commercial (en développement : celle du serveur local). */
function platformOrigin(request: NextRequest): string {
  return isProduction
    ? `https://${settings.MAIN_DOMAIN}`
    : request.nextUrl.origin.replace(/\/\/[^/:]+/, "//localhost");
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  // Appels internes du serveur (tâche planifiée, vérification de santé) : Coolify les fait
  // sur http://localhost, qui n'est le domaine de personne. La tâche vérifie CRON_SECRET.
  if (MACHINE_PATHS.some((path) => hasPrefix(url.pathname, path))) return NextResponse.next();
  const host = classifyHost(request.headers.get("host"), url, hostConfig);

  switch (host.kind) {
    case "redirect":
      return NextResponse.redirect(host.location, 301);
    case "unknown":
      return notFound();
    case "platform":
      if (hasPrefix(url.pathname, SITES_PREFIX)) return notFound();
      if (hasPrefix(url.pathname, "/api") || hasPrefix(url.pathname, "/media")) return NextResponse.next();
      // Référencement du site commercial.
      if (url.pathname === "/sitemap.xml" || url.pathname === "/robots.txt") {
        return NextResponse.rewrite(
          new URL(`/platform-seo/${url.pathname.slice(1).split(".")[0]}`, request.url),
        );
      }
      if (hasPrefix(url.pathname, "/platform-seo")) return notFound();
      {
        const localeRedirect = platformLocaleRedirect(url);
        if (localeRedirect) return NextResponse.redirect(localeRedirect.url, localeRedirect.status);
      }
      return intl(request);
    case "tenant": {
      // La connexion n'existe que sur le domaine principal.
      if (hasPrefix(url.pathname, "/api/auth")) return notFound();
      // L'espace gérante est centralisé sur le domaine principal (décision n° 2).
      if (hasPrefix(url.pathname, "/espace")) {
        return NextResponse.redirect(`${platformOrigin(request)}${url.pathname}${url.search}`, 307);
      }
      const route = await routeTenantHost(host.hostname, url, lookup);
      if (route.kind === "not_found") return notFound();
      if (route.kind === "redirect") {
        return NextResponse.redirect(isProduction ? route.location : devLocation(route.location, url), 301);
      }
      if (hasPrefix(url.pathname, "/api") || hasPrefix(url.pathname, "/media")) return NextResponse.next();

      // Aperçu admin : le jeton reçu dans l'adresse est rangé dans un cookie, puis retiré de l'adresse.
      const secret = authSecret();
      const tokenInUrl = url.searchParams.get(PREVIEW_PARAM);
      if (tokenInUrl !== null) {
        const clean = url.clone();
        clean.searchParams.delete(PREVIEW_PARAM);
        if (!verifyPreviewToken(tokenInUrl, route.tenantId, secret)) return notFound();
        const response = NextResponse.redirect(clean, 307);
        response.cookies.set(PREVIEW_COOKIE, tokenInUrl, {
          httpOnly: true,
          secure: isProduction,
          sameSite: "lax",
          path: "/",
          maxAge: PREVIEW_TTL_SECONDS,
        });
        return response;
      }
      const preview = verifyPreviewToken(request.cookies.get(PREVIEW_COOKIE)?.value, route.tenantId, secret);
      if (route.previewOnly && !preview) return notFound();

      const target = url.clone();
      // sitemap.xml et robots.txt ont une adresse interne dédiée.
      const internalPath = INTERNAL_PATHS[url.pathname] ?? (url.pathname === "/" ? "" : url.pathname);
      target.pathname = `${SITES_PREFIX}/${route.tenantId}${internalPath}`;
      const headers = new Headers(request.headers);
      // Jamais transmis tel quel par le visiteur : seul le proxy le pose.
      headers.delete(PREVIEW_HEADER);
      if (preview) headers.set(PREVIEW_HEADER, "1");
      return NextResponse.rewrite(target, { request: { headers } });
    }
  }
}

/** En développement, nom.horaneo.com devient nom.localhost:<port>. */
function devLocation(location: string, url: URL): string {
  const target = new URL(location);
  target.protocol = url.protocol;
  target.port = url.port;
  if (target.hostname.endsWith(`.${settings.MAIN_DOMAIN}`)) {
    target.hostname = `${target.hostname.slice(0, -settings.MAIN_DOMAIN.length)}localhost`;
  }
  return target.toString();
}

export const config = {
  // Tout sauf les fichiers techniques de Next.js et les fichiers avec extension.
  // Plus sitemap.xml et robots.txt, propres à chaque site client.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)", "/sitemap.xml", "/robots.txt"],
};
