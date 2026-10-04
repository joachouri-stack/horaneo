import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/config/env";
import type { Transaction } from "@/db/client";
import { memberships, plans, sitePages, tenantDomains, tenantSettings, tenants, users } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { normalizePhone } from "@/modules/phone";
import { SITE_PAGE_KEYS } from "@/modules/content/pages";
import { assertValidSlug } from "./slug";

/**
 * Création d'un client par l'administratrice (première étape du formulaire) :
 * le tenant est créé « en création » (draft), avec ses réglages par défaut,
 * son adresse nom.horaneo.com, ses pages vides et le compte de la gérante.
 */

export const createTenantInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase(),
  planCode: z.string().min(1),
  managerEmail: z.email().trim().toLowerCase(),
  managerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z
    .email()
    .trim()
    .toLowerCase()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  country: z.string().length(2).default("FR"),
  timezone: z.string().min(1).default("Europe/Paris"),
  currency: z.string().length(3).default("EUR"),
  defaultLocale: z.string().min(2).max(5).default("fr"),
});

export type CreateTenantInput = z.input<typeof createTenantInput>;

export async function createTenant(tx: Transaction, raw: CreateTenantInput) {
  const input = createTenantInput.parse(raw);
  assertValidSlug(input.slug);
  const hostname = `${input.slug}.${env().MAIN_DOMAIN}`;

  const [plan] = await tx.select().from(plans).where(eq(plans.code, input.planCode));
  if (!plan) throw new AppError("invalid", "planCode");

  const [slugTaken] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug));
  const [hostTaken] = await tx
    .select({ id: tenantDomains.id })
    .from(tenantDomains)
    .where(eq(tenantDomains.hostname, hostname));
  if (slugTaken || hostTaken) throw new AppError("slug_taken", "slug");

  const [tenant] = await tx
    .insert(tenants)
    .values({
      slug: input.slug,
      name: input.name,
      planId: plan.id,
      status: "draft",
      phone: normalizePhone(input.phone, input.country),
      email: input.email ?? input.managerEmail,
      country: input.country.toUpperCase(),
      timezone: input.timezone,
      currency: input.currency.toUpperCase(),
      defaultLocale: input.defaultLocale,
      enabledLocales: [input.defaultLocale],
    })
    .returning();

  await tx.insert(tenantSettings).values({ tenantId: tenant.id });
  await tx.insert(tenantDomains).values({
    tenantId: tenant.id,
    hostname,
    type: "subdomain",
    isPrimary: true,
    status: "active",
    verifiedAt: new Date(),
  });
  await tx
    .insert(sitePages)
    .values(SITE_PAGE_KEYS.map((pageKey) => ({ tenantId: tenant.id, pageKey, content: {} })));

  // Compte de la gérante : créé s'il n'existe pas, puis rattaché à l'établissement.
  const [existing] = await tx
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${input.managerEmail}`);
  const manager =
    existing ??
    (
      await tx
        .insert(users)
        .values({ email: input.managerEmail, name: input.managerName || null })
        .returning()
    )[0];
  await tx
    .insert(memberships)
    .values({ userId: manager.id, tenantId: tenant.id, role: "owner" })
    .onConflictDoNothing();

  return { tenant, managerId: manager.id };
}
