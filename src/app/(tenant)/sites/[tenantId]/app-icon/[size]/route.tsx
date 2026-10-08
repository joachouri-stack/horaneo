import { ImageResponse } from "next/og";
import sharp from "sharp";
import { storage } from "@/lib/storage";
import { getSite } from "@/lib/site/load";
import { buildTheme } from "@/modules/site/theme";

/**
 * Icône de l'application du site (écran d'accueil de la cliente) : le logo de
 * l'établissement en grand, sinon l'initiale de son nom.
 */
const SIZES = new Set([180, 192, 512]);
/** Part de l'icône occupée par le logo. */
const LOGO_RATIO = { any: 0.94, maskable: 0.8 };
const HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=86400" };

/**
 * Logo agrandi au maximum : ses marges vides sont retirées, puis il occupe
 * presque toute l'icône. Version « maskable » (Android découpe l'icône en
 * cercle ou en goutte) : le logo tient dans la zone sûre de 80 %.
 */
async function logoIcon(source: Buffer, size: number, fallbackBg: string, maskable: boolean) {
  // Fond de l'icône : la couleur du coin du logo (son propre fond), sinon celle du site.
  const { data } = await sharp(source)
    .ensureAlpha()
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = data[3] >= 250 ? { r: data[0], g: data[1], b: data[2], alpha: 1 } : fallbackBg;
  const trimmed = await sharp(source)
    .trim({ threshold: 12 })
    .toBuffer()
    .catch(() => source);
  const inner = Math.round(size * (maskable ? LOGO_RATIO.maskable : LOGO_RATIO.any));
  const resized = await sharp(trimmed)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toBuffer();
}

export async function GET(request: Request, { params }: RouteContext<"/sites/[tenantId]/app-icon/[size]">) {
  const { tenantId, size: rawSize } = await params;
  const maskable = new URL(request.url).searchParams.has("maskable");
  const size = Number(rawSize);
  if (!SIZES.has(size)) return new Response(null, { status: 404 });
  const site = await getSite(tenantId);
  const theme = buildTheme(site.tenant.theme, site.tenant.colors);

  const logo = site.logo ? await storage().get(site.logo.key) : null;
  if (logo) {
    const icon = await logoIcon(Buffer.from(logo.body), size, theme.colors.bg, maskable);
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
