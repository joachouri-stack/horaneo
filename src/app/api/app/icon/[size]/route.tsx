import { ImageResponse } from "next/og";

/**
 * Icône de l'espace gérante installé sur l'écran d'accueil et des
 * notifications : les quatre carrés du logo sur fond bleu nuit (même dessin que Logo.tsx).
 */
const SIZES = new Set([96, 180, 192, 512]);

export async function GET(_request: Request, { params }: RouteContext<"/api/app/icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response(null, { status: 404 });
  const mark = Math.round(size * 0.56);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b1033",
      }}
    >
      <svg viewBox="0 0 64 64" width={mark} height={mark}>
        <rect x="6" y="6" width="24" height="24" rx="6" fill="#2f80ff" />
        <rect x="34" y="6" width="24" height="24" rx="6" fill="#2f80ff" />
        <rect x="6" y="34" width="24" height="24" rx="6" fill="#2563eb" />
        <rect x="34" y="34" width="24" height="24" rx="6" fill="#7b3fe4" />
      </svg>
    </div>,
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
