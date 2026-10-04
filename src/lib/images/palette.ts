import sharp from "sharp";
import { colorDistance, hexToRgb, readableTextOn, rgbToHex, saturationLightness } from "@/lib/colors";

/**
 * Déduit les couleurs d'un logo : la couleur principale (la plus présente
 * parmi les couleurs franches), une couleur secondaire bien distincte, et la
 * couleur de texte lisible sur la principale. L'administratrice ajuste ensuite.
 */
export type LogoPalette = { primary: string; secondary: string; onPrimary: string };

export async function extractPalette(input: Uint8Array): Promise<LogoPalette> {
  const { data, info } = await sharp(input, { density: 72 })
    .resize(200, 200, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  type Bucket = { r: number; g: number; b: number; count: number; weight: number };
  const buckets = new Map<number, Bucket>();
  for (let i = 0; i < info.width * info.height * 4; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue; // fond transparent
    const { s, l } = saturationLightness(r, g, b);
    if (l > 0.94) continue; // fond blanc
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0, weight: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    // Les couleurs franches comptent plus que les gris.
    bucket.weight += 0.25 + s;
    buckets.set(key, bucket);
  }

  const colors = [...buckets.values()]
    .sort((x, y) => y.weight - x.weight)
    .map((bucket) => rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count));

  // Les teintes très claires viennent souvent du lissage des bords sur fond blanc : écartées si possible.
  const vivid = colors.filter((color) => {
    const [r, g, b] = hexToRgb(color);
    return saturationLightness(r, g, b).l < 0.7;
  });
  const candidates = vivid.length > 0 ? vivid : colors;
  const primary = candidates[0] ?? "#1f1f1f";
  const secondary =
    candidates.find((color) => colorDistance(color, primary) > 90) ??
    (readableTextOn(primary) === "#ffffff" ? "#f5f1ea" : "#1f1f1f");
  return { primary, secondary, onPrimary: readableTextOn(primary) };
}
