import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
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
      lastVisit: sql<Date | null>`(select max(a.starts_at) from ${appointments} a where a.customer_id = ${customers.id} and a.status in ('confirmed','attended'))`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
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
      visits: history.filter((row) => row.status === "attended").length,
      noShows: history.filter((row) => row.status === "no_show").length,
      spentCents: history
        .filter((row) => row.status === "attended")
        .reduce((sum, row) => sum + row.totalCents, 0),
    },
  };
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
