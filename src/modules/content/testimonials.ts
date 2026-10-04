import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { tenants, testimonials } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { assertFeature } from "@/modules/quotas";
import { setLocalized } from "./localized";

/** Témoignages saisis à la main (packs payants). */

export const testimonialInput = z.object({
  authorName: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(1500),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  isPublished: z.boolean().default(true),
});

async function tenantLocale(tx: Transaction, tenantId: string) {
  const [tenant] = await tx
    .select({ locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  return tenant.locale;
}

export async function listTestimonials(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(testimonials)
    .where(eq(testimonials.tenantId, tenantId))
    .orderBy(asc(testimonials.sortOrder), asc(testimonials.createdAt));
}

export async function saveTestimonial(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof testimonialInput>,
  testimonialId?: string,
) {
  await assertFeature(tx, tenantId, "testimonials");
  const input = testimonialInput.parse(raw);
  const locale = await tenantLocale(tx, tenantId);
  if (testimonialId) {
    const [existing] = await tx
      .select()
      .from(testimonials)
      .where(and(eq(testimonials.id, testimonialId), eq(testimonials.tenantId, tenantId)));
    if (!existing) throw new AppError("not_found");
    const [updated] = await tx
      .update(testimonials)
      .set({ ...input, rating: input.rating ?? null, text: setLocalized(existing.text, locale, input.text) })
      .where(eq(testimonials.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await tx
    .insert(testimonials)
    .values({ tenantId, ...input, rating: input.rating ?? null, text: setLocalized({}, locale, input.text) })
    .returning();
  return created;
}

export async function deleteTestimonial(tx: Transaction, tenantId: string, testimonialId: string) {
  const [deleted] = await tx
    .delete(testimonials)
    .where(and(eq(testimonials.id, testimonialId), eq(testimonials.tenantId, tenantId)))
    .returning();
  if (!deleted) throw new AppError("not_found");
  return deleted;
}
