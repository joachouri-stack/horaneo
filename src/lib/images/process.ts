import { MAX_UPLOAD_BYTES } from "@/config/uploads";
import sharp, { type Metadata } from "sharp";

/**
 * Préparation des photos avant stockage :
 * - vérification du vrai format du fichier (pas seulement de son nom) ;
 * - redressement selon l'orientation du téléphone ;
 * - suppression des données cachées (position GPS, appareil…) ;
 * - redimensionnement et conversion en WebP, léger et net.
 */

export { MAX_UPLOAD_BYTES };

export type ImageKind = "logo" | "cover" | "gallery" | "staff" | "service" | "other";

/** Taille maximale (en pixels) par emplacement. */
export const IMAGE_MAX_SIZE: Record<ImageKind, number> = {
  logo: 800,
  cover: 2400,
  gallery: 2000,
  staff: 1000,
  service: 1600,
  other: 2000,
};

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif", "gif", "tiff"]);

export type ImageErrorCode = "too_large" | "unsupported" | "too_small" | "empty";

export class ImageError extends Error {
  constructor(public code: ImageErrorCode) {
    super(`Image refusée : ${code}`);
  }
}

export type ProcessedImage = {
  body: Uint8Array;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
};

export async function processImage(input: Uint8Array, kind: ImageKind): Promise<ProcessedImage> {
  if (input.byteLength === 0) throw new ImageError("empty");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageError("too_large");

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new ImageError("unsupported");
  }
  // Le logo peut être un SVG : il est converti en image, ce qui neutralise tout script qu'il contiendrait.
  const accepted =
    ACCEPTED_FORMATS.has(metadata.format ?? "") || (kind === "logo" && metadata.format === "svg");
  if (!accepted) throw new ImageError("unsupported");
  if ((metadata.width ?? 0) < 32 || (metadata.height ?? 0) < 32) throw new ImageError("too_small");

  const max = IMAGE_MAX_SIZE[kind];
  const { data, info } = await sharp(input, {
    limitInputPixels: 60_000_000,
    density: kind === "logo" ? 300 : undefined,
  })
    .rotate()
    .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
    .webp({ quality: kind === "logo" ? 90 : 80, alphaQuality: 100, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    body: new Uint8Array(data),
    contentType: "image/webp",
    width: info.width,
    height: info.height,
    bytes: info.size,
  };
}
