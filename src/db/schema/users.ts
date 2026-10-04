import { boolean, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps, utc } from "./_helpers";
import { tenants } from "./tenants";

/**
 * Famille B : comptes. Seules la gérante et l'administratrice ont un compte ;
 * les clientes finales n'en ont jamais.
 *
 * Les tables techniques de connexion (sessions, comptes Google/Apple, liens
 * magiques, double vérification) seront ajoutées à l'étape 3 avec Better Auth.
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
    role: membershipRoleEnum().notNull().default("owner"),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tenantId] }), index("memberships_tenant_idx").on(t.tenantId)],
);
