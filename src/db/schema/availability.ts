import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps, utc } from "./_helpers";
import { staffMembers } from "./content";
import { tenants } from "./tenants";

/**
 * Famille E : horaires et disponibilités.
 * Les horaires sont en heure locale du tenant (9 h reste 9 h au changement d'heure).
 * Les congés et blocages sont des instants précis, en UTC.
 */

const tenantRef = () =>
  uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

/** Horaires d'ouverture de l'établissement (plusieurs plages possibles par jour). */
export const openingHours = pgTable(
  "opening_hours",
  {
    id: id(),
    tenantId: tenantRef(),
    /** 1 = lundi … 7 = dimanche (norme ISO). */
    weekday: smallint().notNull(),
    opensAt: time().notNull(),
    closesAt: time().notNull(),
    ...timestamps(),
  },
  (t) => [
    index("opening_hours_tenant_idx").on(t.tenantId, t.weekday),
    check("opening_hours_weekday", sql`${t.weekday} between 1 and 7`),
    check("opening_hours_range", sql`${t.opensAt} < ${t.closesAt}`),
  ],
);

/** Horaires de travail d'un membre, avec période de validité facultative. */
export const staffSchedules = pgTable(
  "staff_schedules",
  {
    id: id(),
    tenantId: tenantRef(),
    staffId: uuid().notNull(),
    weekday: smallint().notNull(),
    startsAt: time().notNull(),
    endsAt: time().notNull(),
    validFrom: date(),
    validUntil: date(),
    ...timestamps(),
  },
  (t) => [
    index("staff_schedules_staff_idx").on(t.tenantId, t.staffId, t.weekday),
    foreignKey({
      name: "staff_schedules_staff_fk",
      columns: [t.tenantId, t.staffId],
      foreignColumns: [staffMembers.tenantId, staffMembers.id],
    }).onDelete("cascade"),
    check("staff_schedules_weekday", sql`${t.weekday} between 1 and 7`),
    check("staff_schedules_range", sql`${t.startsAt} < ${t.endsAt}`),
    check(
      "staff_schedules_validity",
      sql`${t.validFrom} is null or ${t.validUntil} is null or ${t.validFrom} <= ${t.validUntil}`,
    ),
  ],
);

export const timeOffKindEnum = pgEnum("time_off_kind", ["leave", "block", "closure"]);

/** Congés, créneaux bloqués, journées fermées. staffId vide = tout l'établissement. */
export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    tenantId: tenantRef(),
    staffId: uuid(),
    kind: timeOffKindEnum().notNull(),
    startsAt: utc().notNull(),
    endsAt: utc().notNull(),
    reason: text(),
    ...timestamps(),
  },
  (t) => [
    index("time_off_tenant_range_idx").on(t.tenantId, t.startsAt, t.endsAt),
    foreignKey({
      name: "time_off_staff_fk",
      columns: [t.tenantId, t.staffId],
      foreignColumns: [staffMembers.tenantId, staffMembers.id],
    }).onDelete("cascade"),
    check("time_off_range", sql`${t.startsAt} < ${t.endsAt}`),
  ],
);
