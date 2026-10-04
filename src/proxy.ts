import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { env } from "@/config/env";
import { resolveHostname } from "@/db/access";
import { routing } from "@/i18n/routing";
import { classifyHost, type HostConfig } from "@/lib/tenancy/hosts";
import { parseLocaleRedirectDomains } from "@/lib/tenancy/locale-redirect";
import { SITES_PREFIX } from "@/lib/tenancy/paths";
import { cachedLookup, routeTenantHost } from "@/lib/tenancy/resolve";

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

const hostConfig: HostConfig = {
  mainDomain: settings.MAIN_DOMAIN,
  localeRedirectDomains: parseLocaleRedirectDomains(settings.LOCALE_REDIRECT_DOMAINS),
  devAliases: isProduction ? [] : ["localhost"],
};

const lookup = cachedLookup((hostname) => resolveHostname(hostname));

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
  const host = classifyHost(request.headers.get("host"), url, hostConfig);

  switch (host.kind) {
    case "redirect":
      return NextResponse.redirect(host.location, 301);
    case "unknown":
      return notFound();
    case "platform":
      if (hasPrefix(url.pathname, SITES_PREFIX)) return notFound();
      if (hasPrefix(url.pathname, "/api") || hasPrefix(url.pathname, "/media")) return NextResponse.next();
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
      const target = url.clone();
      target.pathname = `${SITES_PREFIX}/${route.tenantId}${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(target);
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
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
