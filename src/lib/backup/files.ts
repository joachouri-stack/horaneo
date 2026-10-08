import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

/**
 * Copie de sécurité des fichiers (logos, photos) vers un stockage compatible S3
 * (Cloudflare R2). Seuls les fichiers absents ou modifiés sont envoyés ; rien
 * n'est jamais supprimé du côté de la sauvegarde.
 */

export type RemoteObject = { key: string; size: number };

export type BackupBucket = {
  list(prefix: string): Promise<RemoteObject[]>;
  put(key: string, body: Uint8Array): Promise<void>;
};

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => XML_ENTITIES[name]);

/** Lit une page de réponse « ListObjectsV2 ». */
export function parseListObjects(xml: string): { objects: RemoteObject[]; nextToken: string | null } {
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map(([, block]) => ({
    key: unescapeXml(/<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1] ?? ""),
    size: Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? -1),
  }));
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return {
    objects: objects.filter((item) => item.key),
    nextToken: truncated && token ? unescapeXml(token) : null,
  };
}

/** Fichiers à envoyer : absents de la sauvegarde ou de taille différente. */
export function filesToUpload(local: RemoteObject[], remote: RemoteObject[]) {
  const sizes = new Map(remote.map((item) => [item.key, item.size]));
  return local.filter((item) => sizes.get(item.key) !== item.size);
}

/** Tous les fichiers d'un dossier, avec leur chemin relatif (séparateur « / »). */
export async function listLocalFiles(root: string): Promise<RemoteObject[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const files = entries.filter((entry) => entry.isFile());
  return Promise.all(
    files.map(async (entry) => {
      const full = path.join(entry.parentPath, entry.name);
      return { key: path.relative(root, full).split(path.sep).join("/"), size: (await stat(full)).size };
    }),
  );
}

export async function backupFiles(input: { root: string; prefix: string; bucket: BackupBucket }) {
  const prefix = input.prefix.replace(/\/?$/, "/");
  const [local, remote] = await Promise.all([listLocalFiles(input.root), input.bucket.list(prefix)]);
  const remoteRelative = remote
    .filter((item) => item.key.startsWith(prefix))
    .map((item) => ({ key: item.key.slice(prefix.length), size: item.size }));
  const pending = filesToUpload(local, remoteRelative);
  for (const file of pending) {
    await input.bucket.put(`${prefix}${file.key}`, await readFile(path.join(input.root, file.key)));
  }
  return { total: local.length, uploaded: pending.length };
}

/** Accès au compartiment de sauvegarde (API S3). */
export function s3Bucket(config: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}): BackupBucket {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const base = `${config.endpoint.replace(/\/$/, "")}/${encodeURIComponent(config.bucket)}`;
  return {
    async list(prefix) {
      const objects: RemoteObject[] = [];
      let token: string | null = null;
      do {
        const query = new URLSearchParams({ "list-type": "2", prefix });
        if (token) query.set("continuation-token", token);
        const response = await client.fetch(`${base}?${query}`);
        if (!response.ok) throw new Error(`Lecture de la sauvegarde refusée (${response.status})`);
        const page = parseListObjects(await response.text());
        objects.push(...page.objects);
        token = page.nextToken;
      } while (token);
      return objects;
    },
    async put(key, body) {
      const url = `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
      const response = await client.fetch(url, { method: "PUT", body: body as BodyInit });
      if (!response.ok) throw new Error(`Envoi refusé pour ${key} (${response.status})`);
    },
  };
}
