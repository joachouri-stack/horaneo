import { storage } from "@/lib/storage";

/**
 * Fichiers stockés en local (développement) ou sur R2 sans domaine public.
 * Les noms de fichiers sont uniques : ils ne changent jamais, d'où un cache d'un an.
 */
export async function GET(_request: Request, { params }: RouteContext<"/media/[...key]">) {
  const { key } = await params;
  let file;
  try {
    file = await storage().get(key.join("/"));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.body as BodyInit, {
    headers: {
      "content-type": file.contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
