import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
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
import { staffMembers } from "./content";

/**
 * Famille B : comptes. Seules la gérante, ses collaborateurs et l'administratrice
 * ont un compte ; les clientes finales n'en ont jamais.
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

/** « owner » : la gérante (tous les droits) ; « collaborator » : un membre de son équipe invité par elle. */
export const membershipRoleEnum = pgEnum("membership_role", ["owner", "collaborator"]);

/**
 * Droits d'un collaborateur dans l'espace, choisis par la gérante. L'agenda est
 * toujours ouvert (le sien seulement, ou celui de toute l'équipe) ; le reste est
 * fermé sauf case cochée. L'abonnement, l'équipe, les paiements et les réglages
 * restent réservés à la gérante.
 */
export type CollaboratorPermissions = {
  agendaScope?: "own" | "all";
  customers?: boolean;
  stats?: boolean;
  site?: boolean;
  shop?: boolean;
  marketing?: boolean;
};

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
    /** Collaborateur : droits choisis par la gérante (vide pour la gérante, qui a tout). */
    permissions: jsonb().$type<CollaboratorPermissions>().notNull().default({}),
    /** Collaborateur : son membre d'équipe (ses rendez-vous). Le supprimer retire l'accès. */
    staffMemberId: uuid(),
    ...timestamps(),
  },
  (t) => [
    businessForeignKey("memberships_business_fk", t, "cascade"),
    primaryKey({ columns: [t.userId, t.tenantId] }),
    index("memberships_tenant_idx").on(t.tenantId),
    foreignKey({
      name: "memberships_staff_fk",
      columns: [t.tenantId, t.staffMemberId],
      foreignColumns: [staffMembers.tenantId, staffMembers.id],
    }).onDelete("cascade"),
    uniqueIndex("memberships_staff_key").on(t.tenantId, t.staffMemberId),
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
