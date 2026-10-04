import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { legalDocuments } from "@/db/schema";
import { DEFAULT_LOCALE } from "@/i18n/locales";

/**
 * Documents légaux du site commercial (mentions légales, confidentialité,
 * conditions). Chaque enregistrement crée une nouvelle version : les anciennes
 * restent conservées (preuve de ce qui était en vigueur à une date).
 */

export const LEGAL_KEYS = ["legal_notice", "privacy", "terms"] as const;
export type LegalKey = (typeof LEGAL_KEYS)[number];

export async function getLegalDocument(tx: Transaction, key: LegalKey, locale: string) {
  for (const lang of [locale, DEFAULT_LOCALE]) {
    const [row] = await tx
      .select()
      .from(legalDocuments)
      .where(
        and(
          eq(legalDocuments.key, key),
          eq(legalDocuments.locale, lang),
          isNotNull(legalDocuments.publishedAt),
        ),
      )
      .orderBy(desc(legalDocuments.version))
      .limit(1);
    if (row) return row;
  }
  return null;
}

export const legalInput = z.object({
  key: z.enum(LEGAL_KEYS),
  locale: z.string().min(2).max(5),
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(10).max(100_000),
});

export async function publishLegalDocument(
  tx: Transaction,
  raw: z.input<typeof legalInput>,
  now = new Date(),
) {
  const input = legalInput.parse(raw);
  const [latest] = await tx
    .select({ version: legalDocuments.version })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.key, input.key), eq(legalDocuments.locale, input.locale)))
    .orderBy(desc(legalDocuments.version))
    .limit(1);
  const [created] = await tx
    .insert(legalDocuments)
    .values({ ...input, version: (latest?.version ?? 0) + 1, publishedAt: now })
    .returning();
  return created;
}
