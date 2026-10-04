import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { env } from "@/config/env";
import { routing } from "@/i18n/routing";
import { localeRedirectTarget, parseLocaleRedirectDomains } from "@/lib/locale-redirect";

const intl = createIntlMiddleware(routing);
const redirectDomains = parseLocaleRedirectDomains(env().LOCALE_REDIRECT_DOMAINS);

export function proxy(request: NextRequest) {
  // horaneo.fr → horaneo.com/fr (redirection permanente)
  const target = localeRedirectTarget(
    request.nextUrl,
    request.headers.get("host"),
    redirectDomains,
    env().MAIN_DOMAIN,
  );
  if (target) return NextResponse.redirect(target, 301);

  // La reconnaissance des sites clients par nom de domaine arrive à l'étape 2.
  return intl(request);
}

export const config = {
  // Tout sauf les fichiers techniques, les routes d'API et les fichiers avec extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
