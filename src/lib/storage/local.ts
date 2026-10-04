import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSafeKey, type FileStorage } from "./types";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/** Stockage dans un dossier local (développement et tests). */
export function createLocalStorage(directory: string): FileStorage {
  const root = path.resolve(directory);
  const fullPath = (key: string) => {
    assertSafeKey(key);
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw new Error(`Clé de fichier invalide : ${key}`);
    return target;
  };

  return {
    async put(key, body) {
      const target = fullPath(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },
    async get(key) {
      try {
        const body = await readFile(fullPath(key));
        return { body, contentType: CONTENT_TYPES[path.extname(key)] ?? "application/octet-stream" };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      await rm(fullPath(key), { force: true });
    },
    publicUrl(key) {
      assertSafeKey(key);
      return `/media/${key}`;
    },
  };
}
