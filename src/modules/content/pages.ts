import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { sitePages, tenants } from "@/db/schema";
import type { LocalizedText } from "@/i18n/locales";
import { AppError } from "@/modules/errors";
import { setLocalized } from "./localized";

/**
 * Contenu des pages du site d'un client (modèle bien-être). Chaque page a ses
 * champs ; les textes sont traduisibles. L'affichage arrive à l'étape 5.
 */

export const SITE_PAGE_KEYS = [
  "home",
  "about",
  "team",
  "gallery",
  "testimonials",
  "practical",
  "legal",
] as const;
export type SitePageKey = (typeof SITE_PAGE_KEYS)[number];

/** Champs texte de chaque page (tous facultatifs). */
export const PAGE_TEXT_FIELDS = {
  home: [
    "tagline",
    "intro",
    // Modèle Atelier : fin du titre en italique, petite étiquette au-dessus.
    "taglineAccent",
    "badge",
  ],
  about: ["title", "body"],
  team: ["intro"],
  gallery: ["intro"],
  testimonials: ["intro"],
  practical: ["access"],
  legal: ["extra", "credit"],
} as const satisfies Record<SitePageKey, readonly string[]>;

/** Photo associée à certaines pages. */
export const PAGE_PHOTO_FIELD: Partial<Record<SitePageKey, string>> = {
  home: "coverAssetId",
  about: "photoAssetId",
};

export type PageContent = Record<string, LocalizedText | string | null | undefined>;

export const pageUpdateInput = z.object({
  pageKey: z.enum(SITE_PAGE_KEYS),
  texts: z.record(z.string(), z.string().max(5000)),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional(),
  photoAssetId: z.uuid().nullable().optional(),
  isPublished: z.boolean().optional(),
});

export async function getPages(tx: Transaction, tenantId: string) {
  return tx.select().from(sitePages).where(eq(sitePages.tenantId, tenantId));
}

export async function updatePage(tx: Transaction, tenantId: string, raw: z.input<typeof pageUpdateInput>) {
  const input = pageUpdateInput.parse(raw);
  const [tenant] = await tx
    .select({ locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const [page] = await tx
    .select()
    .from(sitePages)
    .where(and(eq(sitePages.tenantId, tenantId), eq(sitePages.pageKey, input.pageKey)));
  if (!page) throw new AppError("not_found");

  const content: PageContent = { ...((page.content as PageContent) ?? {}) };
  for (const field of PAGE_TEXT_FIELDS[input.pageKey]) {
    if (field in input.texts) {
      content[field] = setLocalized(
        content[field] as LocalizedText | undefined,
        tenant.locale,
        input.texts[field],
      );
    }
  }
  const photoField = PAGE_PHOTO_FIELD[input.pageKey];
  if (photoField && input.photoAssetId !== undefined) content[photoField] = input.photoAssetId;

  const [updated] = await tx
    .update(sitePages)
    .set({
      content,
      seoTitle:
        input.seoTitle !== undefined
          ? setLocalized(page.seoTitle, tenant.locale, input.seoTitle)
          : page.seoTitle,
      seoDescription:
        input.seoDescription !== undefined
          ? setLocalized(page.seoDescription, tenant.locale, input.seoDescription)
          : page.seoDescription,
      isPublished: input.isPublished ?? page.isPublished,
    })
    .where(eq(sitePages.id, page.id))
    .returning();
  return updated;
}
