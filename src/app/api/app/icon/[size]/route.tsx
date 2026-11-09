import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Icône de l'espace gérante installé sur l'écran d'accueil et des
 * notifications : le « S » du logo (fichiers de public/brand/).
 * Adresse conservée pour les applications déjà installées.
 */
const SIZES = new Set([96, 180, 192, 512]);

export async function GET(_request: Request, { params }: RouteContext<"/api/app/icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response(null, { status: 404 });
  const file = await readFile(join(process.cwd(), "public", "brand", `app-icon-${size}.png`));
  return new Response(new Uint8Array(file), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}
