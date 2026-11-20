import { assertQuota } from "@/modules/quotas";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { CUSTOMER_SEGMENTS } from "@/config/customers";
import type { Transaction } from "@/db/client";
import {
  appointmentItems,
  appointments,
  customerDataRequests,
  customers,
  giftCards,
  messageLog,
  shopOrders,
  loyaltyEvents,
  loyaltyRewards,
  promoCodes,
  staffMembers,
  tenants,
} from "@/db/schema";
import { pickLocalized, type Locale } from "@/i18n/locales";
import { AppError } from "@/modules/errors";
import { normalizePhone } from "@/modules/phone";
import { isValidBirthday } from "./birthday";

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

/**
 * Fiche déjà enregistrée pour la même personne : même téléphone et même prénom
 * (sans tenir compte des majuscules ni des espaces). Un même numéro partagé par deux
 * personnes (une mère et sa fille) garde deux fiches. Null si aucune.
 */
export async function findSamePerson(
  tx: Transaction,
  tenantId: string,
  person: { phone: string | null; firstName: string },
) {
  if (!person.phone) return null;
  const [row] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        isNull(customers.anonymizedAt),
        eq(customers.phone, person.phone),
        sql`lower(trim(${customers.firstName})) = lower(trim(${person.firstName}))`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export const CUSTOMER_SEGMENT_KEYS = ["all", "loyal", "new", "inactive", "blocked"] as const;
/** Tris du fichier clients : par nom, par dernière visite (récente d'abord), par montant dépensé. */
export const CUSTOMER_SORT_KEYS = ["name", "lastVisit", "spent"] as const;
export type CustomerSort = (typeof CUSTOMER_SORT_KEYS)[number];
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
  input: { query?: string; segment?: CustomerSegment; sort?: CustomerSort; now: Date; limit?: number },
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
      // Réservation à plusieurs collaboratrices : une seule visite.
      visits:
        sql<number>`count(distinct coalesce(${appointments.groupId}, ${appointments.id})) filter (where ${past})`.as(
          "visits",
        ),
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
    blocked: sql`${customers.blockedAt} is not null`,
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
      blocked: sql<boolean>`${customers.blockedAt} is not null`,
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
    .orderBy(
      ...(input.sort === "lastVisit"
        ? [sql`${stats.lastVisit} desc nulls last`]
        : input.sort === "spent"
          ? [sql`coalesce(${stats.spentCents}, 0) desc`]
          : []),
      asc(customers.firstName),
      asc(customers.lastName),
    )
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
      blocked: sql<number>`count(*) filter (where ${segments.blocked})`,
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
      blocked: Number(counts.blocked),
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
      visits: sql<number>`count(distinct coalesce(${appointments.groupId}, ${appointments.id})) filter (where ${past})`,
      noShows: sql<number>`count(distinct coalesce(${appointments.groupId}, ${appointments.id})) filter (where ${appointments.status} = 'no_show')`,
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
  // Coordonnées avant effacement : retrouvées aussi dans les messages, cartes et commandes.
  const [before] = await tx
    .select({ email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
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
      birthMonth: null,
      birthDay: null,
      anonymizedAt: now,
    })
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .returning();
  if (!updated) throw new AppError("not_found");
  // Notes libres de ses rendez-vous (souvent des détails personnels ou de santé) : effacées aussi.
  await tx
    .update(appointments)
    .set({ customerNote: null, internalNote: null })
    .where(and(eq(appointments.customerId, customerId), eq(appointments.tenantId, tenantId)));
  await eraseContactTraces(tx, tenantId, customerId, before ?? { email: null, phone: null }, erasedName, now);
  return updated;
}

/**
 * Traces des coordonnées d'un client effacé ailleurs que sur sa fiche : adresse ou numéro des
 * messages déjà traités (ceux de ses rendez-vous, ou envoyés à ses coordonnées), nom du client
 * dans les alertes, cartes cadeaux achetées ou reçues (une fois envoyées) et commandes terminées.
 * Montants, dates et statuts restent : la comptabilité et les statistiques restent justes.
 */
async function eraseContactTraces(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  contact: { email: string | null; phone: string | null },
  erasedName: string,
  now: Date,
) {
  const email = contact.email?.trim().toLowerCase() || null;
  const recipients = [email, contact.phone].filter((value): value is string => Boolean(value));
  const ownAppointments = tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.customerId, customerId)));
  await tx
    .update(messageLog)
    .set({ recipient: null, data: sql`${messageLog.data} - 'customer'` })
    .where(
      and(
        eq(messageLog.tenantId, tenantId),
        ne(messageLog.status, "queued"),
        or(
          inArray(messageLog.appointmentId, ownAppointments),
          recipients.length > 0 ? inArray(sql`lower(${messageLog.recipient})`, recipients) : sql`false`,
        ),
      ),
    );
  if (!email) return;
  await tx
    .update(giftCards)
    .set({ purchaserName: erasedName, purchaserEmail: "" })
    .where(and(eq(giftCards.tenantId, tenantId), sql`lower(${giftCards.purchaserEmail}) = ${email}`));
  // Carte reçue : effacée une fois envoyée (avant, l'adresse sert encore à l'envoyer).
  await tx
    .update(giftCards)
    .set({ recipientName: null, recipientEmail: null, message: null })
    .where(
      and(
        eq(giftCards.tenantId, tenantId),
        sql`lower(${giftCards.recipientEmail}) = ${email}`,
        sql`${giftCards.sendAt} <= ${now.toISOString()}::timestamptz`,
      ),
    );
  // Commandes terminées seulement : une commande en cours garde de quoi joindre le client.
  await tx
    .update(shopOrders)
    .set({
      customerName: erasedName,
      customerEmail: "",
      customerPhone: null,
      note: null,
      deliveryAddressLine1: null,
      deliveryAddressLine2: null,
      deliveryPostalCode: null,
      deliveryCity: null,
    })
    .where(
      and(
        eq(shopOrders.tenantId, tenantId),
        sql`lower(${shopOrders.customerEmail}) = ${email}`,
        inArray(shopOrders.status, ["collected", "cancelled", "expired", "refunded"]),
      ),
    );
}

/**
 * Supprime un client à la demande de la gérante :
 * - sans aucun rendez-vous : la fiche est supprimée (codes promo et fidélité avec elle) ;
 * - avec des rendez-vous passés : ses données sont effacées comme pour une demande de
 *   suppression (anonymizeCustomer), l'historique et le chiffre d'affaires restent justes ;
 * - avec un rendez-vous à venir : refusé, il faut d'abord l'annuler.
 */
export async function deleteCustomer(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  erasedName: string,
  now = new Date(),
) {
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.id, customerId), eq(customers.tenantId, tenantId), isNull(customers.anonymizedAt)),
    );
  if (!customer) throw new AppError("not_found");
  const [counts] = await tx
    .select({
      total: sql<number>`count(*)`,
      upcoming: sql<number>`count(*) filter (where ${appointments.status} in ('confirmed','pending_payment') and ${appointments.endsAt} > ${now.toISOString()}::timestamptz)`,
    })
    .from(appointments)
    .where(and(eq(appointments.customerId, customerId), eq(appointments.tenantId, tenantId)));
  if (Number(counts.upcoming) > 0) throw new AppError("customer_has_upcoming");
  if (Number(counts.total) > 0) {
    await anonymizeCustomer(tx, tenantId, customerId, erasedName, now);
    return { erased: true };
  }
  await tx.delete(customers).where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
  return { erased: false };
}

/** Champ de formulaire : vide (« » ou absent) = pas d'anniversaire. */
const part = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.coerce.number().int().min(1).max(max).nullable(),
  );

/** Jour et mois saisis : les deux, ou aucun ; une date qui existe (29 février permis). */
export const birthdayInput = z
  .object({ birthMonth: part(12), birthDay: part(31) })
  .refine(
    (value) =>
      value.birthMonth === null
        ? value.birthDay === null
        : value.birthDay !== null && isValidBirthday(value.birthMonth, value.birthDay),
    { path: ["birthDay"] },
  );

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
  /** Anniversaire (jour et mois) : vide pour l'effacer. */
  birthMonth: z.union([z.string(), z.number()]).nullish(),
  birthDay: z.union([z.string(), z.number()]).nullish(),
});

/** Crée ou modifie une fiche (le prénom suffit ; téléphone et e-mail facultatifs). La gérante peut fixer ou changer l'anniversaire. */
export async function saveCustomer(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof customerInput>,
  customerId?: string,
) {
  const input = customerInput.parse(raw);
  // Champs absents (autre appel que le formulaire) : l'anniversaire n'est pas touché.
  const birthday =
    input.birthMonth === undefined && input.birthDay === undefined
      ? {}
      : birthdayInput.parse({ birthMonth: input.birthMonth, birthDay: input.birthDay });
  const [tenant] = await tx
    .select({ country: tenants.country, locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const phone = normalizePhone(input.phone, tenant.country, "phone");
  const values = {
    firstName: input.firstName,
    lastName: input.lastName || null,
    phone,
    // Fiche vérifiée par la gérante : le numéro sert de nouveau à la connexion par SMS.
    phoneDisputed: false,
    email: input.email,
    notes: input.notes || null,
    ...birthday,
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
    // Même personne déjà dans le fichier : pas de seconde fiche.
    if (await findSamePerson(tx, tenantId, { phone, firstName: input.firstName }))
      throw new AppError("customer_exists", "phone");
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

export const blockInput = z.object({
  blocked: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Bloque (ou débloque) un client : il ne peut plus réserver en ligne (reconnu par son e-mail
 * ou son téléphone) et ne reçoit plus d'offres. La gérante peut toujours lui noter un rendez-vous.
 */
export async function setCustomerBlocked(
  tx: Transaction,
  tenantId: string,
  customerId: string,
  raw: z.input<typeof blockInput>,
  now = new Date(),
) {
  const input = blockInput.parse(raw);
  const [updated] = await tx
    .update(customers)
    .set(
      input.blocked
        ? { blockedAt: now, blockedReason: input.reason || null }
        : { blockedAt: null, blockedReason: null },
    )
    .where(
      and(eq(customers.tenantId, tenantId), eq(customers.id, customerId), isNull(customers.anonymizedAt)),
    )
    .returning({ id: customers.id });
  if (!updated) throw new AppError("not_found");
  return updated;
}

/**
 * Fiches qui semblent être la même personne que celle-ci (même téléphone, même e-mail,
 * ou même prénom et même nom) : proposées pour une fusion.
 */
export async function possibleDuplicates(tx: Transaction, tenantId: string, customerId: string) {
  const [current] = await tx
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, customerId)));
  if (!current || current.anonymizedAt) return [];
  const sameName = current.lastName
    ? and(
        sql`lower(trim(${customers.firstName})) = lower(trim(${current.firstName}))`,
        sql`lower(trim(coalesce(${customers.lastName}, ''))) = lower(trim(${current.lastName}))`,
      )
    : undefined;
  return (
    tx
      .select({
        id: customers.id,
        firstName: customers.firstName,
        lastName: customers.lastName,
        phone: customers.phone,
        email: customers.email,
        createdAt: customers.createdAt,
      })
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, tenantId),
          eq(customers.businessId, current.businessId),
          ne(customers.id, current.id),
          isNull(customers.anonymizedAt),
          or(
            current.phone ? eq(customers.phone, current.phone) : undefined,
            current.email ? sql`lower(${customers.email}) = lower(${current.email})` : undefined,
            sameName,
          ),
        ),
      )
      // Même prénom d'abord (la même personne le plus souvent), puis la plus ancienne.
      .orderBy(
        sql`lower(trim(${customers.firstName})) = lower(trim(${current.firstName})) desc`,
        asc(customers.createdAt),
      )
      .limit(20)
  );
}

/**
 * Fusionne deux fiches de la même personne : tout ce qui concerne la fiche en double
 * (rendez-vous, fidélité, codes personnels, demandes sur les données) passe sur la fiche
 * gardée, ses coordonnées manquantes sont complétées et les notes réunies, puis la fiche
 * en double est supprimée. Un seul bon de fidélité en cours est gardé (celui de la fiche gardée).
 */
export async function mergeCustomers(
  tx: Transaction,
  tenantId: string,
  input: { keepId: string; removeId: string; businessId?: string },
) {
  const keepId = z.uuid().parse(input.keepId);
  const removeId = z.uuid().parse(input.removeId);
  if (keepId === removeId) throw new AppError("merge_same_customer", "removeId");
  const rows = await tx
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        inArray(customers.id, [keepId, removeId]),
        isNull(customers.anonymizedAt),
      ),
    );
  const keep = rows.find((row) => row.id === keepId);
  const remove = rows.find((row) => row.id === removeId);
  // Deux fiches de la même entreprise, celle de la gérante quand elle est donnée (rôle plateforme).
  if (
    !keep ||
    !remove ||
    keep.businessId !== remove.businessId ||
    (input.businessId !== undefined && keep.businessId !== input.businessId)
  )
    throw new AppError("not_found");

  const moved = { customerId: keepId };
  await tx
    .update(appointments)
    .set(moved)
    .where(and(eq(appointments.tenantId, tenantId), eq(appointments.customerId, removeId)));
  await tx
    .update(loyaltyEvents)
    .set(moved)
    .where(and(eq(loyaltyEvents.tenantId, tenantId), eq(loyaltyEvents.customerId, removeId)));
  const [keepOpen] = await tx
    .select({ id: loyaltyRewards.id })
    .from(loyaltyRewards)
    .where(and(eq(loyaltyRewards.customerId, keepId), isNull(loyaltyRewards.usedAt)));
  if (keepOpen)
    await tx
      .delete(loyaltyRewards)
      .where(and(eq(loyaltyRewards.customerId, removeId), isNull(loyaltyRewards.usedAt)));
  await tx
    .update(loyaltyRewards)
    .set(moved)
    .where(and(eq(loyaltyRewards.tenantId, tenantId), eq(loyaltyRewards.customerId, removeId)));
  await tx
    .update(promoCodes)
    .set(moved)
    .where(and(eq(promoCodes.tenantId, tenantId), eq(promoCodes.customerId, removeId)));
  await tx
    .update(customerDataRequests)
    .set(moved)
    .where(and(eq(customerDataRequests.tenantId, tenantId), eq(customerDataRequests.customerId, removeId)));
  // Supprimée avant de compléter la fiche gardée (l'e-mail est unique).
  await tx.delete(customers).where(eq(customers.id, removeId));
  const birthday =
    keep.birthMonth == null && remove.birthMonth != null
      ? { birthMonth: remove.birthMonth, birthDay: remove.birthDay }
      : {};
  const consentAt =
    [keep.consentAt, remove.consentAt]
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const optOutAt =
    [keep.marketingOptOutAt, remove.marketingOptOutAt]
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const optedOut = optOutAt !== null && (consentAt === null || optOutAt > consentAt);
  const [merged] = await tx
    .update(customers)
    .set({
      lastName: keep.lastName || remove.lastName,
      phone: keep.phone ?? remove.phone,
      email: keep.email ?? remove.email,
      notes: [keep.notes, remove.notes].filter(Boolean).join("\n\n") || null,
      // Une demande de ne plus recevoir d'offres plus récente que le dernier accord l'emporte.
      emailConsent: (keep.emailConsent || remove.emailConsent) && !optedOut,
      smsConsent: (keep.smsConsent || remove.smsConsent) && !optedOut,
      consentAt,
      marketingOptOutAt: optOutAt,
      // Une des deux fiches bloquée : la fiche gardée l'est aussi.
      blockedAt: keep.blockedAt ?? remove.blockedAt,
      blockedReason: keep.blockedAt ? keep.blockedReason : remove.blockedReason,
      ...birthday,
    })
    .where(eq(customers.id, keepId))
    .returning();
  return merged;
}
