import { ImageResponse } from "next/og";
import sharp from "sharp";
import { storage } from "@/lib/storage";
import { getSite } from "@/lib/site/load";
import { buildTheme } from "@/modules/site/theme";

/**
 * Icône de l'application du site (écran d'accueil de la cliente) : le logo de
 * l'établissement centré sur son fond, sinon l'initiale de son nom.
 */
const SIZES = new Set([180, 192, 512]);
const HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=86400" };

export async function GET(_request: Request, { params }: RouteContext<"/sites/[tenantId]/app-icon/[size]">) {
  const { tenantId, size: rawSize } = await params;
  const size = Number(rawSize);
  if (!SIZES.has(size)) return new Response(null, { status: 404 });
  const site = await getSite(tenantId);
  const theme = buildTheme(site.tenant.theme, site.tenant.colors);

  const logo = site.logo ? await storage().get(site.logo.key) : null;
  if (logo) {
    // Marge pour que le logo reste entier quand le téléphone arrondit l'icône.
    const inner = Math.round(size * 0.64);
    const resized = await sharp(Buffer.from(logo.body))
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const icon = await sharp({
      create: { width: size, height: size, channels: 4, background: theme.colors.bg },
    })
      .composite([{ input: resized, gravity: "center" }])
      .png()
      .toBuffer();
    return new Response(new Uint8Array(icon), { headers: HEADERS });
  }

  const initial = site.tenant.name.trim().charAt(0).toUpperCase() || "•";
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.colors.button,
        color: theme.colors.onButton,
        fontSize: size * 0.5,
        fontWeight: 700,
      }}
    >
      {initial}
    </div>,
    { width: size, height: size, headers: { "cache-control": HEADERS["cache-control"] } },
  );
}
