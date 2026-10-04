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

  // Base de données (facultatives pour construire le site, obligatoires pour s'y connecter)
  /** Propriétaire de la base : migrations et scripts uniquement. */
  DATABASE_URL: z.url().optional(),
  /** Rôle restreint utilisé par l'application (voir src/db/setup-roles.ts). */
  APP_DATABASE_URL: z.url().optional(),

  // Adresse publique du site commercial (par défaut : https://MAIN_DOMAIN)
  PUBLIC_APP_URL: z.url().optional(),

  // Connexion
  /** Clé secrète de signature des sessions (32 caractères minimum, obligatoire en production). */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Connexion avec Apple : laissée vide tant que le compte développeur Apple n'existe pas. */
  APPLE_CLIENT_ID: z.string().min(1).optional(),
  APPLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** En-têtes donnant l'adresse IP réelle du visiteur (limitation des tentatives). */
  CLIENT_IP_HEADERS: z.string().default("x-forwarded-for"),

  // Stockage des fichiers (Cloudflare R2 ; sinon dossier local en développement)
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.url().optional(),
  LOCAL_STORAGE_DIR: z.string().default("storage"),
  /** auto : R2 si configuré, sinon dossier local (refusé en production sauf choix explicite « local »). */
  STORAGE_DRIVER: z.enum(["auto", "local", "r2"]).default("auto"),

  // Assistance (affichée dans l'espace gérante)
  SUPPORT_EMAIL: z.email().optional(),
  /** Numéro WhatsApp de l'assistance prioritaire (format international, ex. 33612345678). */
  SUPPORT_WHATSAPP: z
    .string()
    .regex(/^\d{8,15}$/)
    .optional(),

  // Paiements des acomptes (Stripe Connect, comptes Standard). Sans ces trois clés, le paiement en ligne est désactivé.
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_").optional(),
  /** Secret du point de réception « Connect » (événements des comptes des professionnels). */
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  /** Secret du point de réception des abonnements (événements du compte de la plateforme). */
  STRIPE_BILLING_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),

  // Tâche planifiée : secret attendu par /api/cron/tick (32 caractères minimum).
  CRON_SECRET: z.string().min(32).optional(),

  // E-mails et SMS (Brevo)
  BREVO_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM_ADDRESS: z.email().optional(),

  // Avis Google (Google Places API) : une clé pour tous les sites.
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema> & { ENABLED_LOCALES: Locale[] };

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Une variable laissée vide (« GOOGLE_CLIENT_ID= ») compte comme absente.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  const result = envSchema.safeParse(cleaned);
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

/** Adresse de connexion de l'application (rôle restreint) ; erreur claire si elle manque. */
export function appDatabaseUrl(): string {
  const url = env().APP_DATABASE_URL;
  if (!url) throw new Error("APP_DATABASE_URL n'est pas définie (voir .env.example).");
  return url;
}

/** Adresse publique du site commercial, sans barre finale. */
export function publicAppUrl(): string {
  const config = env();
  if (config.PUBLIC_APP_URL) return config.PUBLIC_APP_URL.replace(/\/$/, "");
  return config.NODE_ENV === "production" ? `https://${config.MAIN_DOMAIN}` : "http://localhost:3000";
}

const DEV_AUTH_SECRET = "dev-only-secret-not-for-production-0000000000";

/** Clé secrète des sessions et du chiffrement ; obligatoire en production. */
export function authSecret(): string {
  const config = env();
  if (config.BETTER_AUTH_SECRET) return config.BETTER_AUTH_SECRET;
  if (config.NODE_ENV === "production") throw new Error("BETTER_AUTH_SECRET est obligatoire en production.");
  return DEV_AUTH_SECRET;
}
