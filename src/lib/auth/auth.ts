import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { authSecret, env, publicAppUrl } from "@/config/env";
import { appDb, type Database } from "@/db/client";
import { authAccounts, authSessions, authVerifications, users } from "@/db/schema";
import { getTranslator, resolveLocale } from "@/i18n/translator";
import { renderActionEmail } from "@/lib/email/layout";
import { sendEmail } from "@/lib/email/send";
import { createLinkToken, loginCodeFor } from "./login-code";

/**
 * Connexion sans mot de passe : Google, Apple (quand configuré) et lien magique
 * (avec, dans le même e-mail, un code à 6 chiffres : voir login-code.ts).
 *
 * Better Auth utilise la connexion de l'application avec le seul rôle hérité
 * app_auth : il n'accède qu'aux tables de connexion et ne peut pas donner le
 * statut d'administratrice (voir drizzle/0005_auth_access.sql).
 */

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

/** Langue choisie par le visiteur (cookie posé par le site commercial). */
function localeFromRequest(request: Request | undefined) {
  const cookie = request?.headers.get("cookie") ?? "";
  return resolveLocale(/(?:^|;\s*)NEXT_LOCALE=([a-z]{2})/.exec(cookie)?.[1]);
}

export async function sendMagicLinkEmail(email: string, url: string, token: string, request?: Request) {
  const locale = localeFromRequest(request);
  const t = await getTranslator(locale);
  const product = env().PRODUCT_NAME;
  const content = renderActionEmail({
    locale,
    brandName: product,
    title: t("emails.magicLink.title", { product }),
    paragraphs: [
      t("emails.magicLink.intro"),
      t("emails.magicLink.expiry", { minutes: MAGIC_LINK_TTL_SECONDS / 60 }),
    ],
    action: { label: t("emails.magicLink.button"), url },
    code: { label: t("emails.magicLink.codeLabel"), value: loginCodeFor(token) },
    footer: t("emails.magicLink.ignore"),
  });
  await sendEmail({ to: email, subject: t("emails.magicLink.subject", { product }), ...content });
}

export function createAuth(database: Database) {
  const config = env();
  const isProduction = config.NODE_ENV === "production";

  return betterAuth({
    appName: config.PRODUCT_NAME,
    baseURL: publicAppUrl(),
    secret: authSecret(),
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { user: users, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET } }
        : {}),
      ...(config.APPLE_CLIENT_ID && config.APPLE_CLIENT_SECRET
        ? { apple: { clientId: config.APPLE_CLIENT_ID, clientSecret: config.APPLE_CLIENT_SECRET } }
        : {}),
    },
    account: {
      // Une même adresse e-mail = un même compte, qu'on arrive par Google, Apple ou lien magique.
      accountLinking: { enabled: true, trustedProviders: ["google", "apple"] },
    },
    user: {
      additionalFields: {
        isPlatformAdmin: { type: "boolean", input: false, required: false, returned: true },
        locale: { type: "string", input: false, required: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        twoFactorVerifiedAt: { type: "date", input: false, required: false },
      },
    },
    advanced: {
      database: { generateId: false },
      useSecureCookies: isProduction,
      ipAddress: {
        ipAddressHeaders: config.CLIENT_IP_HEADERS.split(",").map((header) => header.trim().toLowerCase()),
      },
    },
    rateLimit: {
      enabled: config.NODE_ENV !== "test",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/magic-link": { window: 15 * 60, max: 5 },
        "/magic-link/verify": { window: 60, max: 10 },
        "/sign-in/social": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await database.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, session.userId));
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: "hashed",
        // Jeton recalculable : l'e-mail contient aussi un code qui ouvre le même lien.
        generateToken: (email) => createLinkToken(email, MAGIC_LINK_TTL_SECONDS, database),
        sendMagicLink: async ({ email, url, token }, ctx) =>
          sendMagicLinkEmail(email, url, token, ctx?.request),
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { horaneoAuth?: Auth };

/** Instance de connexion de l'application (créée au premier usage). */
export function getAuth(): Auth {
  globalForAuth.horaneoAuth ??= createAuth(appDb());
  return globalForAuth.horaneoAuth;
}
