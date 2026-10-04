import { sql } from "drizzle-orm";
import { char, integer, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import type { LocalizedText } from "@/i18n/locales";

/** Identifiant UUID v7 (triable par date), généré par la base. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuid_generate_v7()`);

/** Date en heure universelle (UTC). */
export const utc = () => timestamp({ withTimezone: true, mode: "date" });

export const timestamps = () => ({
  createdAt: utc().notNull().defaultNow(),
  updatedAt: utc()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Montant en centimes. */
export const cents = () => integer();

/** Code devise ISO 4217 (EUR, USD…). */
export const currency = () => char({ length: 3 });

/** Texte traduisible : { "fr": "...", "en": "..." }. */
export const localized = () => jsonb().$type<LocalizedText>();
