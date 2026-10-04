import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { contrastRatio, readableTextOn } from "@/lib/colors";
import { extractPalette } from "@/lib/images/palette";
import { ImageError, MAX_UPLOAD_BYTES, processImage } from "@/lib/images/process";
import { createLocalStorage } from "@/lib/storage/local";

/** Image de test unie, ou en deux couleurs (moitié gauche / droite). */
async function image(
  width: number,
  height: number,
  left: string,
  right = left,
  format: "png" | "jpeg" = "png",
) {
  const half = Math.floor(width / 2);
  const base = sharp({ create: { width, height, channels: 4, background: right } });
  const leftPart = await sharp({ create: { width: half, height, channels: 4, background: left } })
    .png()
    .toBuffer();
  return new Uint8Array(
    await base
      .composite([{ input: leftPart, left: 0, top: 0 }])
      [format]()
      .toBuffer(),
  );
}

describe("traitement des photos", () => {
  it("convertit en WebP et réduit les grandes images", async () => {
    const result = await processImage(await image(4000, 3000, "#336699"), "gallery");
    expect(result.contentType).toBe("image/webp");
    expect(Math.max(result.width, result.height)).toBe(2000);
    expect((await sharp(result.body).metadata()).format).toBe("webp");
  });

  it("n'agrandit pas les petites images", async () => {
    const result = await processImage(await image(300, 200, "#336699"), "gallery");
    expect([result.width, result.height]).toEqual([300, 200]);
  });

  it("supprime les données cachées (EXIF, position GPS)", async () => {
    const withExif = new Uint8Array(
      await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ff0000" } })
        .jpeg()
        .withExif({ IFD0: { Copyright: "secret", Artist: "Téléphone de Léa" } })
        .toBuffer(),
    );
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const result = await processImage(withExif, "gallery");
    expect((await sharp(result.body).metadata()).exif).toBeUndefined();
  });

  it("refuse un fichier qui n'est pas une image, même renommé", async () => {
    await expect(
      processImage(new TextEncoder().encode("<html>pas une image</html>"), "gallery"),
    ).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("refuse un SVG ailleurs que pour le logo, et le convertit pour le logo", async () => {
    const svg = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><script>alert(1)</script><rect width="200" height="100" fill="#e8503f"/></svg>`,
    );
    await expect(processImage(svg, "gallery")).rejects.toBeInstanceOf(ImageError);
    const logo = await processImage(svg, "logo");
    expect(logo.contentType).toBe("image/webp");
    expect(new TextDecoder().decode(logo.body)).not.toContain("script");
  });

  it("refuse les fichiers trop lourds, vides ou minuscules", async () => {
    await expect(processImage(new Uint8Array(MAX_UPLOAD_BYTES + 1), "gallery")).rejects.toMatchObject({
      code: "too_large",
    });
    await expect(processImage(new Uint8Array(), "gallery")).rejects.toMatchObject({ code: "empty" });
    await expect(processImage(await image(10, 10, "#000000"), "gallery")).rejects.toMatchObject({
      code: "too_small",
    });
  });
});

describe("couleurs du logo", () => {
  it("trouve la couleur principale et une couleur secondaire distincte", async () => {
    // Logo : 3/4 corail, 1/4 bleu nuit, sur fond transparent.
    const width = 200;
    const coral = await sharp({ create: { width: 150, height: 100, channels: 4, background: "#e8503f" } })
      .png()
      .toBuffer();
    const navy = await sharp({ create: { width: 50, height: 100, channels: 4, background: "#1b2a4a" } })
      .png()
      .toBuffer();
    const logo = await sharp({
      create: { width, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: coral, left: 0, top: 0 },
        { input: navy, left: 150, top: 0 },
      ])
      .png()
      .toBuffer();
    const palette = await extractPalette(new Uint8Array(logo));
    expect(palette.primary).toMatch(/^#e[0-9a-f]5[0-9a-f]3[0-9a-f]$/);
    expect(palette.secondary).toMatch(/^#1[0-9a-f]2[0-9a-f]4[0-9a-f]$/);
    expect(contrastRatio(palette.primary, palette.onPrimary)).toBeGreaterThan(3);
  });

  it("ignore le fond blanc", async () => {
    const palette = await extractPalette(await image(200, 100, "#ffffff", "#2e9e6b"));
    expect(palette.primary).toMatch(/^#2[0-9a-f]9[0-9a-f]6[0-9a-f]$/);
  });

  it("choisit un texte lisible sur une couleur", () => {
    expect(readableTextOn("#1b2a4a")).toBe("#ffffff");
    expect(readableTextOn("#faf7f2")).toBe("#1f1f1f");
  });
});

describe("stockage local", () => {
  let dir: string;
  afterAll(async () => dir && rm(dir, { recursive: true, force: true }));

  it("enregistre, relit, supprime et donne une adresse publique", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "horaneo-storage-"));
    const store = createLocalStorage(dir);
    await store.put("tenants/a/photo.webp", new Uint8Array([1, 2, 3]), "image/webp");
    expect(await store.get("tenants/a/photo.webp")).toEqual({
      body: expect.any(Buffer),
      contentType: "image/webp",
    });
    expect(store.publicUrl("tenants/a/photo.webp")).toBe("/media/tenants/a/photo.webp");
    await store.delete("tenants/a/photo.webp");
    expect(await store.get("tenants/a/photo.webp")).toBeNull();
  });

  it("refuse toute clé qui sortirait du dossier", async () => {
    const store = createLocalStorage(dir);
    for (const key of ["../secret", "a/../../etc/passwd", "/etc/passwd", "a//b", "a b"]) {
      await expect(store.get(key), key).rejects.toThrow(/invalide/);
    }
  });
});
