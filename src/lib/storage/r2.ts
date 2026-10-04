import { AwsClient } from "aws4fetch";
import { assertSafeKey, type FileStorage } from "./types";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Domaine public du bucket (ex. https://media.horaneo.com). Sans lui, les fichiers passent par /media. */
  publicUrl?: string;
};

/** Stockage Cloudflare R2 (API compatible S3). */
export function createR2Storage(config: R2Config): FileStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  const url = (key: string) => {
    assertSafeKey(key);
    return `${endpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;
  };

  return {
    async put(key, body, contentType) {
      const response = await client.fetch(url(key), {
        method: "PUT",
        body: body as BodyInit,
        headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
      });
      if (!response.ok) throw new Error(`R2 a refusé l'envoi (${response.status})`);
    },
    async get(key) {
      const response = await client.fetch(url(key));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`R2 a refusé la lecture (${response.status})`);
      return {
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
      };
    },
    async delete(key) {
      const response = await client.fetch(url(key), { method: "DELETE" });
      if (!response.ok && response.status !== 404)
        throw new Error(`R2 a refusé la suppression (${response.status})`);
    },
    publicUrl(key) {
      assertSafeKey(key);
      return config.publicUrl ? `${config.publicUrl.replace(/\/$/, "")}/${key}` : `/media/${key}`;
    },
  };
}
