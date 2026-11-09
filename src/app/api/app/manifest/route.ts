import { getTranslations } from "next-intl/server";
import { env } from "@/config/env";
import { resolveLocale } from "@/i18n/translator";

/**
 * Fiche d'application de l'espace gérante : permet de l'ajouter à l'écran
 * d'accueil du téléphone (obligatoire sur iPhone pour recevoir les notifications).
 */
export async function GET(request: Request) {
  const locale = resolveLocale(new URL(request.url).searchParams.get("l") ?? "");
  const t = await getTranslations({ locale, namespace: "manager.app" });
  const product = env().PRODUCT_NAME;
  return Response.json(
    {
      name: t("name", { product }),
      short_name: product,
      start_url: `/${locale}/espace`,
      scope: "/",
      display: "standalone",
      background_color: "#0b1033",
      theme_color: "#0b1033",
      lang: locale,
      icons: [
        { src: "/api/app/icon/192", sizes: "192x192", type: "image/png" },
        { src: "/api/app/icon/512", sizes: "512x512", type: "image/png" },
        { src: "/brand/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } },
  );
}
