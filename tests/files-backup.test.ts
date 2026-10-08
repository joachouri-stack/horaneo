import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backupFiles, filesToUpload, parseListObjects, type BackupBucket } from "@/lib/backup/files";

describe("sauvegarde des fichiers", () => {
  let root = "";
  afterEach(() => rm(root, { recursive: true, force: true }));

  it("lit une page de liste S3, entités et suite comprises", () => {
    const xml = `<ListBucketResult><IsTruncated>true</IsTruncated>
      <Contents><Key>fichiers/a&amp;b.webp</Key><Size>12</Size></Contents>
      <Contents><Key>fichiers/c.png</Key><Size>0</Size></Contents>
      <NextContinuationToken>abc&amp;1</NextContinuationToken></ListBucketResult>`;
    expect(parseListObjects(xml)).toEqual({
      objects: [
        { key: "fichiers/a&b.webp", size: 12 },
        { key: "fichiers/c.png", size: 0 },
      ],
      nextToken: "abc&1",
    });
    expect(parseListObjects("<IsTruncated>false</IsTruncated>").nextToken).toBeNull();
  });

  it("n'envoie que les fichiers absents ou modifiés", () => {
    const local = [
      { key: "a", size: 1 },
      { key: "b", size: 2 },
      { key: "c", size: 3 },
    ];
    expect(
      filesToUpload(local, [
        { key: "a", size: 1 },
        { key: "b", size: 5 },
      ]).map((f) => f.key),
    ).toEqual(["b", "c"]);
  });

  it("copie le dossier une fois, puis plus rien au passage suivant", async () => {
    root = await mkdtemp(path.join(tmpdir(), "backup-"));
    await mkdir(path.join(root, "tenants/t1"), { recursive: true });
    await writeFile(path.join(root, "tenants/t1/logo.webp"), "logo");
    await writeFile(path.join(root, "racine.png"), "png!");
    const stored = new Map<string, Uint8Array>();
    const bucket: BackupBucket = {
      list: async (prefix) =>
        [...stored]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, body]) => ({ key, size: body.length })),
      put: async (key, body) => void stored.set(key, body),
    };

    expect(await backupFiles({ root, prefix: "fichiers", bucket })).toEqual({ total: 2, uploaded: 2 });
    expect([...stored.keys()].sort()).toEqual(["fichiers/racine.png", "fichiers/tenants/t1/logo.webp"]);
    expect(await backupFiles({ root, prefix: "fichiers", bucket })).toEqual({ total: 2, uploaded: 0 });
    expect(await backupFiles({ root: path.join(root, "absent"), prefix: "fichiers", bucket })).toEqual({
      total: 0,
      uploaded: 0,
    });
  });
});
