export type StoredFile = { body: Uint8Array; contentType: string };

export interface FileStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
  /** Adresse publique du fichier (pour les balises <img>). */
  publicUrl(key: string): string;
}

/** Les clés ne contiennent que des caractères sûrs : impossible de sortir du dossier. */
const KEY = /^[a-z0-9][a-z0-9/_.-]*$/i;

export function assertSafeKey(key: string) {
  if (!KEY.test(key) || key.includes("..") || key.includes("//") || key.length > 300) {
    throw new Error(`Clé de fichier invalide : ${key}`);
  }
}
