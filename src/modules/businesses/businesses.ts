import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { businessSettings, businesses, memberships, services, tenants, users } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { normalizePhone } from "@/modules/phone";

/**
 * Entreprises d'un site. Dans la plupart des cas il n'y en a qu'une ; un
 * institut partagé par deux indépendantes en a deux, chacune avec son SIRET,
 * son compte Stripe, son équipe, ses prestations, son agenda et ses clientes.
 * Création et identité légale : administratrice uniquement (rôle plateforme).
 */

export const businessInput = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(200).optional(),
  siret: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^[0-9A-Za-z]{0,20}$/))
    .optional(),
  vatNumber: z.string().trim().max(30).optional(),
  email: z
    .email()
    .trim()
    .toLowerCase()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  phone: z.string().trim().max(40).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().max(20).optional(),
  city: z.string().trim().max(120).optional(),
});

export type BusinessInput = z.input<typeof businessInput>;

export async function listBusinesses(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(businesses)
    .where(eq(businesses.tenantId, tenantId))
    .orderBy(sql`${businesses.isPrimary} desc`, asc(businesses.sortOrder), asc(businesses.createdAt));
}

export async function getBusiness(tx: Transaction, tenantId: string, businessId: string) {
  const [row] = await tx
    .select()
    .from(businesses)
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.id, businessId)));
  if (!row) throw new AppError("not_found");
  return row;
}

/** Compte d'une gérante : retrouvé par son e-mail, ou créé. */
export async function ensureUser(tx: Transaction, email: string, name?: string | null) {
  const normalized = email.trim().toLowerCase();
  const [existing] = await tx
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`);
  if (existing) return existing;
  const [created] = await tx
    .insert(users)
    .values({ email: normalized, name: name || null })
    .returning();
  return created;
}

/**
 * Ajoute une entreprise à un site, avec ses réglages par défaut et, si fourni,
 * le compte de sa gérante (qui ne verra que cette entreprise).
 */
export async function createBusiness(
  tx: Transaction,
  tenantId: string,
  raw: BusinessInput & { isPrimary?: boolean; managerEmail?: string; managerName?: string | null },
) {
  const input = businessInput.parse(raw);
  if (raw.managerEmail !== undefined && !z.email().safeParse(raw.managerEmail.trim()).success) {
    throw new AppError("invalid", "managerEmail");
  }
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const [{ value: existingCount }] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(businesses)
    .where(eq(businesses.tenantId, tenantId));
  const [business] = await tx
    .insert(businesses)
    .values({
      tenantId,
      name: input.name,
      legalName: input.legalName || null,
      siret: input.siret || null,
      vatNumber: input.vatNumber || null,
      email: input.email ?? null,
      phone: normalizePhone(input.phone, tenant.country),
      addressLine1: input.addressLine1 || null,
      postalCode: input.postalCode || null,
      city: input.city || null,
      // La première entreprise d'un site est l'entreprise principale (elle règle l'abonnement).
      isPrimary: raw.isPrimary ?? existingCount === 0,
      sortOrder: existingCount,
    })
    .returning();
  await tx.insert(businessSettings).values({ businessId: business.id, tenantId });
  let managerId: string | null = null;
  if (raw.managerEmail) {
    const manager = await ensureUser(tx, raw.managerEmail, raw.managerName);
    managerId = manager.id;
    const [already] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, manager.id), eq(memberships.tenantId, tenantId)));
    // Une gérante est rattachée à une seule entreprise d'un site.
    if (already) throw new AppError("manager_already_linked", "managerEmail");
    await tx
      .insert(memberships)
      .values({ userId: manager.id, tenantId, businessId: business.id, role: "owner" });
  }
  return { business, managerId };
}

/** Identité légale et coordonnées d'une entreprise. */
export async function updateBusiness(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  raw: BusinessInput,
) {
  const input = businessInput.parse(raw);
  const [tenant] = await tx
    .select({ country: tenants.country })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const [updated] = await tx
    .update(businesses)
    .set({
      name: input.name,
      legalName: input.legalName || null,
      siret: input.siret || null,
      vatNumber: input.vatNumber || null,
      email: input.email ?? null,
      phone: normalizePhone(input.phone, tenant?.country ?? "FR"),
      addressLine1: input.addressLine1 || null,
      postalCode: input.postalCode || null,
      city: input.city || null,
    })
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.id, businessId)))
    .returning();
  if (!updated) throw new AppError("not_found");
  return updated;
}

/**
 * Entreprise qui réalise les prestations choisies. Un rendez-vous ne mélange
 * jamais les prestations de deux entreprises (paiement et agenda distincts).
 */
export async function businessOfServices(tx: Transaction, tenantId: string, serviceIds: string[]) {
  const unique = [...new Set(serviceIds)];
  if (unique.length === 0) throw new AppError("service_unavailable", "serviceIds");
  const rows = await tx
    .select({ businessId: services.businessId })
    .from(services)
    .where(and(eq(services.tenantId, tenantId), inArray(services.id, unique)));
  if (rows.length !== unique.length) throw new AppError("service_unavailable", "serviceIds");
  const ids = new Set(rows.map((row) => row.businessId));
  if (ids.size !== 1) throw new AppError("services_mixed", "serviceIds");
  return rows[0].businessId;
}

/** Abonnement du site : géré seulement par l'entreprise principale (celle qui le règle). */
export async function assertPrimaryBusiness(tx: Transaction, tenantId: string, businessId: string) {
  const business = await getBusiness(tx, tenantId, businessId);
  if (!business.isPrimary) throw new AppError("primary_business_only");
}
