import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import {
  assets,
  businessSettings,
  businesses,
  memberships,
  services,
  tenants,
  users,
  type BusinessProfile,
} from "@/db/schema";
import { setLocalized } from "@/modules/content/localized";
import { slugify } from "@/modules/tenants/slug";
import { AppError } from "@/modules/errors";
import { retireAsset } from "@/modules/media/assets";
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
  /** Fiche Google (identifiant « place », ex. ChIJ…) : ses avis s'affichent sur le site. */
  googlePlaceId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{10,200}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
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
  const managerId = raw.managerEmail
    ? await linkManager(tx, tenantId, business.id, raw.managerEmail, raw.managerName)
    : null;
  return { business, managerId };
}

async function linkManager(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  email: string,
  name?: string | null,
) {
  const manager = await ensureUser(tx, email, name);
  const [already] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, manager.id), eq(memberships.tenantId, tenantId)));
  // Une gérante est rattachée à une seule entreprise d'un site.
  if (already) throw new AppError("manager_already_linked", "managerEmail");
  await tx.insert(memberships).values({ userId: manager.id, tenantId, businessId, role: "owner" });
  return manager.id;
}

/**
 * Donne l'accès gérante d'une entreprise existante (ex. entreprise ajoutée ou
 * importée sans gérante). Elle se connecte ensuite avec son e-mail (lien de
 * connexion) et ne voit que cette entreprise.
 */
export async function addBusinessManager(
  tx: Transaction,
  tenantId: string,
  input: { businessId: string; email: string; name?: string | null },
) {
  const email = z.email().safeParse(input.email.trim());
  if (!email.success) throw new AppError("invalid", "managerEmail");
  const business = await getBusiness(tx, tenantId, input.businessId);
  const managerId = await linkManager(tx, tenantId, business.id, email.data, input.name?.trim() || null);
  return { business, managerId };
}

/**
 * Remplace la gérante d'une entreprise : l'ancienne perd aussitôt l'accès à son
 * espace (son compte est conservé), la nouvelle se connecte avec son e-mail.
 */
export async function replaceBusinessManager(
  tx: Transaction,
  tenantId: string,
  input: { businessId: string; email: string; name?: string | null },
) {
  const email = z.email().safeParse(input.email.trim());
  if (!email.success) throw new AppError("invalid", "managerEmail");
  const business = await getBusiness(tx, tenantId, input.businessId);
  const removed = await tx
    .delete(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.businessId, business.id),
        eq(memberships.role, "owner"),
      ),
    )
    .returning({ userId: memberships.userId });
  const managerId = await linkManager(tx, tenantId, business.id, email.data, input.name?.trim() || null);
  return { business, managerId, removedIds: removed.map((row) => row.userId) };
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
      ...("googlePlaceId" in raw ? { googlePlaceId: input.googlePlaceId ?? null } : {}),
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

const BUSINESS_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const businessProfileInput = z.object({
  /** Adresse de sa page : /avec/<slug> (proposée à partir du nom si vide). */
  slug: z.string().trim().toLowerCase().max(40).optional(),
  title: z.string().trim().max(60).optional(),
  role: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  quote: z.string().trim().max(280).optional(),
  availability: z.string().trim().max(80).optional(),
  photoAssetId: z.uuid().nullable().optional(),
  shopName: z.string().trim().max(80).optional(),
});

/**
 * Présentation publique d'une entreprise (sa page sur le site). Les textes
 * sont rangés sous la langue principale du site, sans effacer les traductions.
 */
export async function updateBusinessProfile(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  raw: z.input<typeof businessProfileInput>,
) {
  const input = businessProfileInput.parse(raw);
  const business = await getBusiness(tx, tenantId, businessId);
  const [tenant] = await tx
    .select({ locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const locale = tenant?.locale ?? "fr";
  const slug = input.slug || slugify(business.name).slice(0, 40).replace(/-+$/, "");
  if (!BUSINESS_SLUG.test(slug) || slug.includes("--")) throw new AppError("slug_invalid", "slug");
  const [taken] = await tx
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.slug, slug)));
  if (taken && taken.id !== businessId) throw new AppError("slug_taken", "slug");
  if (input.photoAssetId) {
    const [photo] = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.id, input.photoAssetId)));
    if (!photo) throw new AppError("invalid", "photoAssetId");
  }
  const previous = business.profile ?? {};
  const profile: BusinessProfile = {
    title: setLocalized(previous.title, locale, input.title),
    role: setLocalized(previous.role, locale, input.role),
    bio: setLocalized(previous.bio, locale, input.bio),
    quote: setLocalized(previous.quote, locale, input.quote),
    availability: setLocalized(previous.availability, locale, input.availability),
    photoAssetId: input.photoAssetId !== undefined ? input.photoAssetId : (previous.photoAssetId ?? null),
    shopName: input.shopName !== undefined ? input.shopName || null : (previous.shopName ?? null),
    logoAssetId: previous.logoAssetId ?? null,
  };
  const [updated] = await tx
    .update(businesses)
    .set({ slug, profile })
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.id, businessId)))
    .returning();
  return updated;
}

/**
 * Logo propre à une entreprise (`null` : le retire). L'ancien logo est mis de
 * côté, récupérable pendant le délai de conservation.
 */
export async function setBusinessLogo(
  tx: Transaction,
  tenantId: string,
  businessId: string,
  assetId: string | null,
) {
  const business = await getBusiness(tx, tenantId, businessId);
  if (assetId) {
    const [logo] = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.tenantId, tenantId), eq(assets.id, assetId)));
    if (!logo) throw new AppError("invalid", "file");
  }
  const previous = business.profile ?? {};
  if (previous.logoAssetId && previous.logoAssetId !== assetId) {
    await retireAsset(tx, tenantId, previous.logoAssetId, assetId).catch((error: unknown) => {
      // Déjà retiré depuis l'écran Photos : rien à mettre de côté.
      if (!(error instanceof AppError && error.code === "not_found")) throw error;
    });
  }
  const [updated] = await tx
    .update(businesses)
    .set({ profile: { ...previous, logoAssetId: assetId } })
    .where(and(eq(businesses.tenantId, tenantId), eq(businesses.id, businessId)))
    .returning();
  return updated;
}
