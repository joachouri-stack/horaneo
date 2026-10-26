import { assertQuota } from "@/modules/quotas";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { CUSTOMER_SEGMENTS } from "@/config/customers";
import type { Transaction } from "@/db/client";
import { appointmentItems, appointments, customers, staffMembers, tenants } from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";
import { normalizePhone } from "@/modules/phone";

/** Fiches clientes de l'établissement : recherche, historique, notes. */

export async function searchCustomers(tx: Transaction, tenantId: string, query: string, limit = 50) {
  const q = query.trim();
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  // « 06 12 34 » doit trouver « +33 6 12 34… » : on ignore le 0 initial des numéros nationaux.
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  return tx
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      phone: customers.phone,
      email: customers.email,
      // Dernière visite passée. La colonne de la cliente est écrite en entier : sans le nom
      // de table, « id » désignerait celui du rendez-vous dans la sous-requête.
      lastVisit: sql<Date | null>`(select max(a.starts_at) from ${appointments} a where a.customer_id = "customers"."id" and a.status in ('confirmed','attended') and a.starts_at <= now())`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        // Fiches effacées à la demande de la cliente : plus proposées.
        isNull(customers.anonymizedAt),
        q
          ? or(
              ilike(customers.firstName, pattern),
              ilike(customers.lastName, pattern),
              ilike(customers.email, pattern),
              sql`${customers.firstName} || ' ' || coalesce(${customers.lastName}, '') ilike ${pattern}`,
              digits.length >= 3 ? ilike(customers.phone, `%${digits.slice(-9)}%`) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(asc(customers.firstName), asc(customers.lastName))
    .limit(limit);
}

export const CUSTOMER_SEGMENT_KEYS = ["all", "loyal", "new", "inactive"] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENT_KEYS)[number];

const toDate = (value: unknown) => (value == null ? null : new Date(value as string));

/**
 * Fichier clientes de la page « Clientes » : chaque fiche avec ses visites passées, le total
 * dépensé, la dernière et la prochaine visite, ses groupes (fidèle, nouvelle, à relancer),
 * filtrable par groupe et par recherche ; plus le nombre de fiches de chaque groupe.
 */
export async function customerDirectory(
  tx: Transaction,
  tenantId: string,
  input: { query?: string; segment?: CustomerSegment; now: Date; limit?: number },
) {
  const { loyalVisits, newDays, inactiveDays } = CUSTOMER_SEGMENTS;
  const day = 24 * 60 * 60 * 1000;
  // Dates passées en texte : le pilote ne convertit pas un Date dans une requête SQL brute.
  const now = sql`${input.now.toISOString()}::timestamptz`;
  const newSince = sql`${new Date(input.now.getTime() - newDays * day).toISOString()}::timestamptz`;
  const inactiveBefore = sql`${new Date(input.now.getTime() - inactiveDays * day).toISOString()}::timestamptz`;
  const past = sql`${appointments.status} in ('confirmed','attended') and ${appointments.startsAt} <= ${now}`;
  const stats = tx
    .select({
      customerId: appointments.customerId,
      visits: sql<number>`count(*) filter (where ${past})`.as("visits"),
      spentCents: sql<number>`coalesce(sum(${appointments.totalCents}) filter (where ${past}), 0)`.as(
        "spent_cents",
      ),
      lastVisit: sql<string | null>`max(${appointments.startsAt}) filter (where ${past})`.as("last_visit"),
      nextVisit: sql<
        string | null
      >`min(${appointments.startsAt}) filter (where ${appointments.status} in ('pending_payment','confirmed') and ${appointments.startsAt} > ${now})`.as(
        "next_visit",
      ),
    })
    .from(appointments)
    .where(eq(appointments.tenantId, tenantId))
    .groupBy(appointments.customerId)
    .as("stats");

  const visits = sql<number>`coalesce(${stats.visits}, 0)`;
  const segments = {
    loyal: sql`${visits} >= ${loyalVisits}`,
    // Une cliente déjà fidèle n'est plus « nouvelle », même si sa fiche est récente.
    new: sql`${customers.createdAt} >= ${newSince} and ${visits} < ${loyalVisits}`,
    inactive: sql`${visits} > 0 and ${stats.lastVisit} < ${inactiveBefore} and ${stats.nextVisit} is null`,
  };

  const q = input.query?.trim() ?? "";
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  const segment = input.segment ?? "all";

  const where = and(
    eq(customers.tenantId, tenantId),
    isNull(customers.anonymizedAt),
    segment === "all" ? undefined : segments[segment],
    q
      ? or(
          ilike(customers.firstName, pattern),
          ilike(customers.lastName, pattern),
          ilike(customers.email, pattern),
          sql`${customers.firstName} || ' ' || coalesce(${customers.lastName}, '') ilike ${pattern}`,
          digits.length >= 3 ? ilike(customers.phone, `%${digits.slice(-9)}%`) : undefined,
        )
      : undefined,
  );

  // Requêtes l'une après l'autre : elles partagent la connexion de la transaction.
  const rows = await tx
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      phone: customers.phone,
      email: customers.email,
      visits,
      spentCents: sql<number>`coalesce(${stats.spentCents}, 0)`,
      lastVisit: stats.lastVisit,
      nextVisit: stats.nextVisit,
      loyal: sql<boolean>`${segments.loyal}`,
      isNew: sql<boolean>`${segments.new}`,
      inactive: sql<boolean>`coalesce(${segments.inactive}, false)`,
    })
    .from(customers)
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(where)
    .orderBy(asc(customers.firstName), asc(customers.lastName))
    .limit(input.limit ?? 200);
  // Nombre de fiches correspondant au filtre : la liste dit quand elle n'affiche pas tout.
  const [{ matching }] = await tx
    .select({ matching: sql<number>`count(*)` })
    .from(customers)
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(where);
  const [counts] = await tx
    .select({
      all: sql<number>`count(*)`,
      visited: sql<number>`count(*) filter (where ${visits} > 0)`,
      loyal: sql<number>`count(*) filter (where ${segments.loyal})`,
      new: sql<number>`count(*) filter (where ${segments.new})`,
      inactive: sql<number>`count(*) filter (where ${segments.inactive})`,
    })
    .from(customers)
    .leftJoin(stats, eq(stats.customerId, customers.id))
    .where(and(eq(customers.tenantId, tenantId), isNull(customers.anonymizedAt)));

  return {
    matching: Number(matching),
    customers: rows.map((row) => ({
      ...row,
      visits: Number(row.visits),
      spentCents: Number(row.spentCents),
      lastVisit: toDate(row.lastVisit),
      nextVisit: toDate(row.nextVisit),
    })),
    counts: {
      all: Number(counts.all),
      visited: Number(counts.visited),
      loyal: Number(counts.loyal),
      new: Number(counts.new),
      inactive: Number(counts.inactive),
    },
  };
}

export async function getCustomer(tx: Transaction, tenantId: string, customerId: string, locale: Locale) {
  const [customer] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
  if (!customer) return null;
  const history = await tx
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      totalCents: appointments.totalCents,
      currency: appointments.currency,
      staffName: staffMembers.name,
    })
    .from(appointments)
    .innerJoin(staffMembers, eq(staffMembers.id, appointments.staffId))
    .where(and(eq(appointments.customerId, customer.id), sql`${appointments.status} <> 'expired'`))
    .orderBy(desc(appointments.startsAt))
    .limit(100);
  // Totaux sur tout l'historique, avec la même règle que la liste des clientes :
  // une visite est un rendez-vous passé, confirmé ou marqué « venue ».
  const past = sql`${appointments.status} in ('confirmed','attended') and ${appointments.startsAt} <= now()`;
  const [totals] = await tx
    .select({
      visits: sql<number>`count(*) filter (where ${past})`,
      noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')`,
      spentCents: sql<number>`coalesce(sum(${appointments.totalCents}) filter (where ${past}), 0)`,
    })
    .from(appointments)
    .where(eq(appointments.customerId, customer.id));
  const items = history.length
    ? await tx
        .select({ appointmentId: appointmentItems.appointmentId, name: appointmentItems.serviceName })
        .from(appointmentItems)
        .where(sql`${appointmentItems.appointmentId} in ${history.map((row) => row.id)}`)
        .orderBy(asc(appointmentItems.position))
    : [];
  return {
    customer,
    history: history.map((row) => ({
      ...row,
      services: items
        .filter((item) => item.appointmentId === row.id)
        .map((item) => pickLocalized(item.name, locale)),
    })),
    stats: {
      visits: Number(totals.visits),
      noShows: Number(totals.noShows),
      spentCents: Number(totals.spentCents),
    },
  };
}

/**
 * Efface les données d'une cliente à sa demande : nom remplacé par `erasedName`
 * (texte traduit, ex. « Cliente effacée »), coordonnées, notes et accords retirés.
 * La fiche reste pour l'historique des rendez-vous et la comptabilité.
 */
export async function anonymizeCustomer(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  erasedName: string,
  now = new Date(),
) {
  const [updated] = await tx
    .update(customers)
    .set({
      firstName: erasedName,
      lastName: null,
      email: null,
      phone: null,
      notes: null,
      emailConsent: false,
      smsConsent: false,
      consentAt: null,
      anonymizedAt: now,
    })
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError("not_found");
  return updated;
}

export const customerInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || null)
    .pipe(z.email().nullable()),
  notes: z.string().trim().max(2000).optional(),
});

/** Crée ou modifie une fiche (au moins un téléphone ou un e-mail). */
export async function saveCustomer(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof customerInput>,
  customerId?: string,
) {
  const input = customerInput.parse(raw);
  const [tenant] = await tx
    .select({ country: tenants.country, locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const phone = normalizePhone(input.phone, tenant.country, "phone");
  if (!phone && !input.email) throw new AppError("invalid", "phone");
  const values = {
    firstName: input.firstName,
    lastName: input.lastName || null,
    phone,
    email: input.email,
    notes: input.notes || null,
  };
  try {
    if (customerId) {
      const [updated] = await tx
        .update(customers)
        .set(values)
        .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
        .returning();
      if (!updated) throw new AppError("not_found");
      return updated;
    }
    // Nombre de fiches clients limité par le pack (ex. Basic).
    await assertQuota(tx, tenantId, "customers");
    const [created] = await tx
      .insert(customers)
      .values({ tenantId, locale: tenant.locale, ...values })
      .returning();
    return created;
  } catch (error) {
    const err = error as { code?: string; cause?: { code?: string } };
    // Même e-mail qu'une autre fiche de l'établissement.
    if ((err.code ?? err.cause?.code) === "23505") throw new AppError("invalid", "email");
    throw error;
  }
}
