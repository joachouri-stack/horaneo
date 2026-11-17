import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { customers, tenants } from "@/db/schema";
import { AppError } from "@/modules/errors";
import { normalizePhone } from "@/modules/phone";
import { countUsage, getTenantPlan } from "@/modules/quotas";
import { isValidBirthday } from "./birthday";
import { findSamePerson } from "./customers";

/**
 * Import d'un fichier clients dans l'entreprise en cours (fiches créées d'un coup).
 * Une personne déjà présente (même prénom et même téléphone, ou même e-mail) n'est
 * pas recréée ; une ligne sans prénom ou sans coordonnée valable est signalée.
 */

/** Lignes envoyées par lot (le navigateur découpe les gros fichiers). */
export const IMPORT_BATCH = 500;
/** Lignes en erreur détaillées au plus dans le bilan. */
const MAX_REPORTED = 50;

const rowInput = z.object({
  line: z.number().int().min(1),
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(200),
  notes: z.string().trim().max(2000),
  birthMonth: z.number().int().nullable(),
  birthDay: z.number().int().nullable(),
});

export const importCustomersInput = z.object({
  rows: z.array(rowInput).min(1).max(IMPORT_BATCH),
  /** La gérante confirme que ces personnes ont accepté de recevoir ses offres. */
  consent: z.boolean(),
});

export type ImportProblem = { line: number; reason: "name" | "contact" | "phone" | "email" };
export type ImportReport = {
  created: number;
  duplicates: number;
  invalid: number;
  problems: ImportProblem[];
  /** Limite de fiches du pack atteinte : les lignes suivantes n'ont pas été importées. */
  quotaReached: boolean;
};

export async function importCustomers(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof importCustomersInput>,
  now = new Date(),
): Promise<ImportReport> {
  const input = importCustomersInput.parse(raw);
  const [tenant] = await tx
    .select({ country: tenants.country, locale: tenants.defaultLocale })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new AppError("not_found");
  const { limits } = await getTenantPlan(tx, tenantId);
  const limit = limits.customers ?? null;
  let count = limit === null ? 0 : await countUsage(tx, tenantId, "customers");

  const report: ImportReport = { created: 0, duplicates: 0, invalid: 0, problems: [], quotaReached: false };
  const problem = (line: number, reason: ImportProblem["reason"]) => {
    report.invalid += 1;
    if (report.problems.length < MAX_REPORTED) report.problems.push({ line, reason });
  };
  const consent = input.consent ? { emailConsent: true, smsConsent: true, consentAt: now } : {};

  for (const row of input.rows) {
    if (!row.firstName) {
      problem(row.line, "name");
      continue;
    }
    let phone: string | null;
    try {
      phone = normalizePhone(row.phone, tenant.country);
    } catch {
      problem(row.line, "phone");
      continue;
    }
    const email = row.email ? row.email.toLowerCase() : null;
    if (email && !z.email().safeParse(email).success) {
      problem(row.line, "email");
      continue;
    }
    if (!phone && !email) {
      problem(row.line, "contact");
      continue;
    }
    // Déjà dans le fichier (ou plus haut dans ce même fichier) : pas de seconde fiche.
    const sameEmail = email
      ? await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              isNull(customers.anonymizedAt),
              sql`${customers.businessId} = app_current_business()`,
              sql`lower(${customers.email}) = ${email}`,
            ),
          )
          .limit(1)
      : [];
    if (sameEmail.length > 0 || (await findSamePerson(tx, tenantId, { phone, firstName: row.firstName }))) {
      report.duplicates += 1;
      continue;
    }
    if (limit !== null && count >= limit) {
      report.quotaReached = true;
      break;
    }
    const birthday =
      row.birthMonth !== null && row.birthDay !== null && isValidBirthday(row.birthMonth, row.birthDay)
        ? { birthMonth: row.birthMonth, birthDay: row.birthDay }
        : {};
    await tx.insert(customers).values({
      tenantId,
      locale: tenant.locale,
      firstName: row.firstName,
      lastName: row.lastName || null,
      phone,
      email,
      notes: row.notes || null,
      ...birthday,
      ...consent,
    });
    report.created += 1;
    count += 1;
  }
  return report;
}
