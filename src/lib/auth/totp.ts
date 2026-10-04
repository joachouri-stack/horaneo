import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { Secret, TOTP } from "otpauth";

/**
 * Double vérification par code à 6 chiffres (applications Google Authenticator,
 * Microsoft Authenticator, 1Password…), norme TOTP : un nouveau code toutes les 30 s.
 */

const PERIOD = 30;
const DIGITS = 6;
/** Tolérance d'un pas de 30 s avant/après, pour les horloges légèrement décalées. */
const WINDOW = 1;

function totp(secretBase32: string, label = "", issuer = "") {
  return new TOTP({
    issuer,
    label,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** Adresse otpauth:// à afficher sous forme de QR code. */
export function totpUri(secretBase32: string, account: string, issuer: string): string {
  return totp(secretBase32, account, issuer).toString();
}

/** Code valable à un instant donné (sert aux tests). */
export function totpCodeAt(secretBase32: string, timestamp: number): string {
  return totp(secretBase32).generate({ timestamp });
}

/**
 * Vérifie un code. Renvoie le pas de temps accepté, ou null.
 * Un code déjà utilisé (pas ≤ lastUsedStep) est refusé : il ne sert qu'une fois.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastUsedStep: number | null,
  now: number = Date.now(),
): number | null {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const delta = totp(secretBase32).validate({ token, timestamp: now, window: WINDOW });
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

// ─── Chiffrement du secret en base (AES-256-GCM) ──────────────────────────────

function encryptionKey(masterSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterSecret, "admin-two-factor", "totp-secret", 32));
}

export function encryptSecret(plain: string, masterSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(masterSecret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, masterSecret: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Secret chiffré illisible");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(masterSecret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// ─── Codes de secours (si le téléphone est perdu) ─────────────────────────────

const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.replace(/[\s-]/g, "").toLowerCase()).digest("hex");
}

/** Génère 8 codes de secours ; seules leurs empreintes sont gardées en base. */
export function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (byte) => BACKUP_ALPHABET[byte % BACKUP_ALPHABET.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashBackupCode) };
}

/** Renvoie les empreintes restantes si le code est valable (il est alors consommé), sinon null. */
export function consumeBackupCode(code: string, hashes: string[]): string[] | null {
  const candidate = Buffer.from(hashBackupCode(code), "hex");
  const index = hashes.findIndex((hash) => {
    const stored = Buffer.from(hash, "hex");
    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
  });
  if (index === -1) return null;
  return hashes.filter((_, i) => i !== index);
}
