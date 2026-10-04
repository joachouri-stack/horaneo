import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { businessForeignKey } from "./tenants";
import { sql } from "drizzle-orm";
import { id, timestamps, utc } from "./_helpers";
import { tenants } from "./tenants";

/**
 * Famille B : comptes. Seules la gérante et l'administratrice ont un compte ;
 * les clientes finales n'en ont jamais.
 *
 * Les tables auth_* sont gérées par Better Auth (connexion Google, Apple,
 * lien magique). Elles ne contiennent aucune donnée métier d'un tenant.
 */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    name: text(),
    image: text(),
    locale: text().notNull().default("fr"),
    isPlatformAdmin: boolean().notNull().default(false),
    twoFactorEnabled: boolean().notNull().default(false),
    lastLoginAt: utc(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)],
);

export const membershipRoleEnum = pgEnum("membership_role", ["owner"]);

/** Qui gère quel établissement. Une personne peut en gérer plusieurs. */
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Rempli automatiquement avec l'entreprise en cours (app_current_business()). */
    businessId: uuid()
      .notNull()
      .default(sql`app_current_business()`),
    role: membershipRoleEnum().notNull().default("owner"),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("memberships_business_fk", t, "cascade"),
    primaryKey({ columns: [t.userId, t.tenantId] }),
    index("memberships_tenant_idx").on(t.tenantId),
  ],
);

/** Sessions ouvertes (cookie de connexion). */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull(),
    expiresAt: utc().notNull(),
    ipAddress: text(),
    userAgent: text(),
    /** Moment où l'administratrice a saisi son code de double vérification pour cette session. */
    twoFactorVerifiedAt: utc(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("auth_sessions_token_key").on(t.token), index("auth_sessions_user_idx").on(t.userId)],
);

/** Comptes de connexion liés (Google, Apple). */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text().notNull(),
    accountId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: utc(),
    refreshTokenExpiresAt: utc(),
    scope: text(),
    /** Jamais utilisé : pas de mot de passe. Présent car attendu par Better Auth. */
    password: text(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("auth_accounts_provider_account_key").on(t.providerId, t.accountId),
    index("auth_accounts_user_idx").on(t.userId),
  ],
);

/** Jetons à usage unique (liens magiques, états OAuth). */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    // Texte : Better Auth y range parfois ses propres identifiants (empreintes).
    id: text()
      .primaryKey()
      .default(sql`uuid_generate_v7()::text`),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: utc().notNull(),
    ...timestamps(),
  },
  (t) => [index("auth_verifications_identifier_idx").on(t.identifier)],
);

/**
 * Double vérification de l'administratrice (code à 6 chiffres d'une
 * application d'authentification). Le secret est chiffré.
 */
export const adminTwoFactors = pgTable("admin_two_factors", {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEncrypted: text().notNull(),
  /** Confirmé quand un premier code valide a été saisi. */
  confirmedAt: utc(),
  /** Dernier pas de temps accepté : un même code ne sert qu'une fois. */
  lastUsedStep: integer(),
  /** Empreintes des codes de secours restants. */
  backupCodeHashes: text()
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  ...timestamps(),
});
