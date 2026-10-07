import { ImageResponse } from "next/og";

/**
 * Icône de l'espace gérante installé sur l'écran d'accueil et des
 * notifications : l'horloge du logo sur fond ivoire (même dessin que Logo.tsx).
 */
const SIZES = new Set([96, 180, 192, 512]);

export async function GET(_request: Request, { params }: RouteContext<"/api/app/icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response(null, { status: 404 });
  const mark = Math.round(size * 0.62);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#faf7f2",
      }}
    >
      <svg viewBox="0 0 54 54" width={mark} height={mark}>
        <path
          d="M40.18 42.70 A20.5 20.5 0 1 1 22.39 7.02"
          fill="none"
          stroke="#1b2a4a"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M39.62 10.85 A20.5 20.5 0 0 1 47.49 27.72"
          fill="none"
          stroke="#e8503f"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M27 27 L27 18.5 M27 27 L33.5 30.5"
          fill="none"
          stroke="#e8503f"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>,
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  );
}
