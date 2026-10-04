import { z } from "zod";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/i18n/locales";

/**
 * Lecture et vérification des variables de configuration.
 * Aucune clé secrète n'est écrite dans le code : tout vient de l'environnement
 * (fichier .env en local, variables Coolify en production).
 */

const localeList = z
  .string()
  .default(DEFAULT_LOCALE)
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(SUPPORTED_LOCALES)).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Identité du produit (valeurs de départ : Horaneo / horaneo.com)
  PRODUCT_NAME: z.string().min(1).default("Horaneo"),
  MAIN_DOMAIN: z.string().min(1).default("horaneo.com"),
  /** Domaines secondaires redirigés vers une langue du site commercial, ex. "horaneo.fr=fr". */
  LOCALE_REDIRECT_DOMAINS: z.string().default("horaneo.fr=fr"),

  // Langues activées (doivent avoir leur fichier messages/<langue>.json)
  ENABLED_LOCALES: localeList,

  // Base de données (facultative pour construire le site, obligatoire pour s'y connecter)
  DATABASE_URL: z.url().optional(),
});

export type Env = z.infer<typeof envSchema> & { ENABLED_LOCALES: Locale[] };

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration invalide :\n${details}`);
  }
  const env = result.data;
  if (!env.ENABLED_LOCALES.includes(DEFAULT_LOCALE)) {
    throw new Error(`ENABLED_LOCALES doit contenir la langue par défaut (${DEFAULT_LOCALE}).`);
  }
  return env;
}

let cached: Env | undefined;

/** Configuration de l'application, vérifiée au premier accès. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Adresse de la base de données ; erreur claire si elle manque. */
export function databaseUrl(): string {
  const url = env().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL n'est pas définie (voir .env.example).");
  return url;
}
