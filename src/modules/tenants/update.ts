import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { BRAND_PALETTES, type BrandPaletteKey } from "@/config/site";
import { env } from "@/config/env";
import type { Transaction } from "@/db/client";
import { plans, tenantDomains, tenants, type TenantBrand } from "@/db/schema";
import { HEX_COLOR } from "@/lib/colors";
import { AppError } from "@/modules/errors";
import { normalizePhone } from "@/modules/phone";
import { assertValidSlug } from "./slug";

async function loadTenant(tx: Transaction, tenantId: string) {
  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  return tenant;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

// ─── Coordonnées ──────────────────────────────────────────────────────────────

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value.replace(",", ".")) : null))
    .pipe(z.number().min(min).max(max).nullable());

export const identityInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase(),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => value || null)
    .pipe(z.email().nullable()),
  addressLine1: optionalText(160),
  addressLine2: optionalText(160),
  postalCode: optionalText(12),
  city: optionalText(80),
  country: z.string().length(2),
  timezone: z.string().min(1),
  /** Coordonnées GPS facultatives (« 45,7640 » ou « 45.7640 ») pour afficher le plan. */
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
});

/** Met à jour les coordonnées ; un changement d'adresse nom.horaneo.com suit le slug. */
export async function updateIdentity(tx: Transaction, tenantId: string, raw: z.input<typeof identityInput>) {
  const input = identityInput.parse(raw);
  const tenant = await loadTenant(tx, tenantId);
  if (input.slug !== tenant.slug) {
    assertValidSlug(input.slug);
    const hostname = `${input.slug}.${env().MAIN_DOMAIN}`;
    const [taken] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, input.slug));
    const [hostTaken] = await tx
      .select({ id: tenantDomains.id })
      .from(tenantDomains)
      .where(eq(tenantDomains.hostname, hostname));
    if (taken || hostTaken) throw new AppError("slug_taken", "slug");
    await tx
      .update(tenantDomains)
      .set({ hostname })
      .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.type, "subdomain")));
  }
  // Coordonnées GPS : modifiées seulement si le formulaire les envoie (jamais effacées par oubli).
  const { latitude, longitude, ...rest } = input;
  const gps = "latitude" in raw || "longitude" in raw ? { latitude, longitude } : {};
  const [updated] = await tx
    .update(tenants)
    .set({
      ...rest,
      ...gps,
      country: input.country.toUpperCase(),
      phone: normalizePhone(input.phone, input.country),
    })
    .where(eq(tenants.id, tenantId))
    .returning();
  return updated;
}

// ─── Métier, modèle et apparence ─────────────────────────────────────────────

/** Modèles de site : « wellness » (sobre), « atelier » (institut, une page par professionnelle). */
export const TEMPLATE_KEYS = ["wellness", "atelier"] as const;
export const THEME_KEYS = ["light", "dark", "nature", "blush"] as const;

export const appearanceInput = z.object({
  businessCategory: optionalText(60),
  templateKey: z.enum(TEMPLATE_KEYS),
  theme: z.enum(THEME_KEYS),
  primary: z.string().regex(HEX_COLOR),
  secondary: z.string().regex(HEX_COLOR),
});

export async function updateAppearance(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof appearanceInput>,
) {
  const input = appearanceInput.parse(raw);
  const tenant = await loadTenant(tx, tenantId);
  const brand: TenantBrand = {
    ...tenant.brand,
    colors: {
      ...tenant.brand.colors,
      primary: input.primary.toLowerCase(),
      secondary: input.secondary.toLowerCase(),
    },
  };
  const [updated] = await tx
    .update(tenants)
    .set({
      businessCategory: input.businessCategory,
      templateKey: input.templateKey,
      theme: input.theme,
      brand,
    })
    .where(eq(tenants.id, tenantId))
    .returning();
  return updated;
}

/** Palette proposée, ou « original » : les couleurs d'avant la première palette choisie. */
export const paletteInput = z.object({
  palette: z.string().refine((key) => key === "original" || key in BRAND_PALETTES),
});

/** Couleurs choisies par la gérante parmi les palettes proposées (le reste de l'apparence ne change pas). */
export async function setBrandPalette(tx: Transaction, tenantId: string, raw: z.input<typeof paletteInput>) {
  const { palette } = paletteInput.parse(raw);
  const tenant = await loadTenant(tx, tenantId);
  const { colors: current, originalColors } = tenant.brand;
  // Première palette : les couleurs de départ sont gardées pour pouvoir y revenir.
  const original = originalColors ?? { primary: current?.primary, secondary: current?.secondary };
  const colors = palette === "original" ? original : BRAND_PALETTES[palette as BrandPaletteKey];
  await tx
    .update(tenants)
    .set({ brand: { ...tenant.brand, originalColors: original, colors: { ...current, ...colors } } })
    .where(eq(tenants.id, tenantId));
  return colors;
}

export async function setLogo(tx: Transaction, tenantId: string, logoAssetId: string | null) {
  const tenant = await loadTenant(tx, tenantId);
  await tx
    .update(tenants)
    .set({ brand: { ...tenant.brand, logoAssetId } })
    .where(eq(tenants.id, tenantId));
}

// ─── Réseaux sociaux ──────────────────────────────────────────────────────────

export const socialUrl = (host: RegExp) =>
  z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || (URL.canParse(value) && host.test(new URL(value).hostname)), "invalid");

export const socialInput = z.object({
  instagram: socialUrl(/(^|\.)instagram\.com$/),
  facebook: socialUrl(/(^|\.)(facebook\.com|fb\.com)$/),
});

/** Liens vers les pages Instagram et Facebook (affichés dans le pied de page). */
export async function updateSocial(tx: Transaction, tenantId: string, raw: z.input<typeof socialInput>) {
  const input = socialInput.parse(raw);
  const tenant = await loadTenant(tx, tenantId);
  await tx
    .update(tenants)
    .set({ brand: { ...tenant.brand, social: input } })
    .where(eq(tenants.id, tenantId));
}

// ─── Bouton de contact (barre du bas sur téléphone) ──────────────────────────

export const contactBarInput = z.object({
  mode: z.enum(["call", "sms"]),
  phone: z.string().trim().max(30).optional(),
});

/** « Appeler » ou « SMS » à côté de « Réserver » ; numéro vide = numéro du site. */
export async function updateContactBar(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof contactBarInput>,
) {
  const input = contactBarInput.parse(raw);
  const tenant = await loadTenant(tx, tenantId);
  const phone = normalizePhone(input.phone, tenant.country, "contactPhone");
  await tx
    .update(tenants)
    .set({ brand: { ...tenant.brand, contactBar: { mode: input.mode, phone } } })
    .where(eq(tenants.id, tenantId));
}

// ─── Statut ───────────────────────────────────────────────────────────────────

export type TenantStatusAction = "activate" | "suspend" | "reactivate";

/** Mise en ligne, suspension et réactivation d'un site. */
export async function changeStatus(tx: Transaction, tenantId: string, action: TenantStatusAction) {
  const tenant = await loadTenant(tx, tenantId);
  const allowed: Record<TenantStatusAction, string[]> = {
    activate: ["draft"],
    suspend: ["active", "cancelled"],
    reactivate: ["suspended"],
  };
  if (!allowed[action].includes(tenant.status)) throw new AppError("invalid", "status");
  const [updated] = await tx
    .update(tenants)
    .set(
      action === "suspend"
        ? { status: "suspended" }
        : { status: "active", activatedAt: tenant.activatedAt ?? new Date() },
    )
    .where(eq(tenants.id, tenantId))
    .returning();
  return { before: tenant.status, after: updated.status };
}

// ─── Pack ─────────────────────────────────────────────────────────────────────

/**
 * Change le pack. Si le nouveau pack n'autorise pas de domaine propre, le site
 * revient sur son adresse nom.horaneo.com (le domaine propre est conservé, inactif).
 * Le prélèvement Stripe sera branché à l'étape 10.
 */
export async function changePlan(tx: Transaction, tenantId: string, planCode: string) {
  const tenant = await loadTenant(tx, tenantId);
  const [plan] = await tx.select().from(plans).where(eq(plans.code, planCode));
  if (!plan) throw new AppError("invalid", "planCode");
  await tx.update(tenants).set({ planId: plan.id }).where(eq(tenants.id, tenantId));
  if (!plan.features.customDomain) {
    await tx
      .update(tenantDomains)
      .set({ isPrimary: false })
      .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.type, "custom")));
    await tx
      .update(tenantDomains)
      .set({ isPrimary: true })
      .where(and(eq(tenantDomains.tenantId, tenantId), eq(tenantDomains.type, "subdomain")));
  }
  return { before: tenant.planId, after: plan.id, planCode: plan.code };
}
