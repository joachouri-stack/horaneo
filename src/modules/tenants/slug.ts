import { RESERVED_SUBDOMAINS } from "@/config/reserved";
import { AppError } from "@/modules/errors";

/** « Institut Léa & Co » → « institut-lea-co » */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

/** Vérifie qu'une adresse nom.horaneo.com est utilisable (format, mots réservés). */
export function assertValidSlug(slug: string) {
  if (!SLUG.test(slug) || slug.includes("--")) throw new AppError("slug_invalid", "slug");
  if (RESERVED_SUBDOMAINS.has(slug)) throw new AppError("slug_reserved", "slug");
}
