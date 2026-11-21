import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { siteSetups, tenantDomains, type SiteSetupAnswers } from "@/db/schema";
import { AppError } from "@/modules/errors";

/**
 * Mise en route d'un site créé pour le client (packs avec site complet) :
 * 1. il envoie le questionnaire (activité, prestations, horaires, style, nom de domaine…) ;
 * 2. l'équipe crée son site ;
 * 3. l'équipe le lui présente : il le valide ;
 * 4. son nom de domaine est branché (packs qui l'incluent) ;
 * 5. le site est mis en ligne (statut « actif »).
 * Tout se passe dans le même compte : le tableau de bord ne change pas.
 */

export const SETUP_STEPS = ["info", "building", "review", "domain", "online"] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number];
export type SetupStep = { key: SetupStepKey; state: "done" | "current" | "todo" };

const answer = z.string().trim().max(2000).optional().default("");
export const setupAnswersInput = z.object({
  activity: z.string().trim().min(1).max(2000),
  services: answer,
  hours: answer,
  style: answer,
  domain: z.string().trim().max(200).optional().default(""),
  links: answer,
  notes: answer,
});

/** Suivi de mise en route du site (null : pas de suivi pour ce site). */
export async function getSiteSetup(tx: Transaction, tenantId: string) {
  const [row] = await tx.select().from(siteSetups).where(eq(siteSetups.tenantId, tenantId));
  return row ?? null;
}

/** Ouvre le suivi (création d'un site avec un pack où l'équipe crée le site). Sans effet s'il existe. */
export async function startSiteSetup(tx: Transaction, tenantId: string) {
  await tx.insert(siteSetups).values({ tenantId }).onConflictDoNothing();
  return getSiteSetup(tx, tenantId);
}

async function requireSetup(tx: Transaction, tenantId: string) {
  const setup = await getSiteSetup(tx, tenantId);
  if (!setup) throw new AppError("not_found");
  return setup;
}

/** Questionnaire envoyé (ou corrigé) par le client, tant que son site n'est pas validé. */
export async function submitSetupAnswers(
  tx: Transaction,
  tenantId: string,
  raw: z.input<typeof setupAnswersInput>,
  now = new Date(),
) {
  const setup = await requireSetup(tx, tenantId);
  if (setup.approvedAt) throw new AppError("invalid");
  const parsed = setupAnswersInput.safeParse(raw);
  if (!parsed.success) throw new AppError("invalid", String(parsed.error.issues[0]?.path[0] ?? ""));
  const answers: SiteSetupAnswers = parsed.data;
  const [updated] = await tx
    .update(siteSetups)
    .set({ answers, submittedAt: setup.submittedAt ?? now, updatedAt: now })
    .where(eq(siteSetups.tenantId, tenantId))
    .returning();
  return updated;
}

/** Site prêt (équipe) : le client est invité à le valider. */
export async function requestSiteReview(tx: Transaction, tenantId: string, now = new Date()) {
  await requireSetup(tx, tenantId);
  const [updated] = await tx
    .update(siteSetups)
    .set({ reviewRequestedAt: now, approvedAt: null, updatedAt: now })
    .where(eq(siteSetups.tenantId, tenantId))
    .returning();
  return updated;
}

/** Site validé par le client (seulement une fois présenté par l'équipe). */
export async function approveSite(tx: Transaction, tenantId: string, now = new Date()) {
  const setup = await requireSetup(tx, tenantId);
  if (!setup.reviewRequestedAt) throw new AppError("invalid");
  if (setup.approvedAt) return setup;
  const [updated] = await tx
    .update(siteSetups)
    .set({ approvedAt: now, updatedAt: now })
    .where(eq(siteSetups.tenantId, tenantId))
    .returning();
  return updated;
}

/** Un nom de domaine propre est-il branché et actif ? */
export async function hasActiveCustomDomain(tx: Transaction, tenantId: string) {
  const [row] = await tx
    .select({ id: tenantDomains.id })
    .from(tenantDomains)
    .where(
      and(
        eq(tenantDomains.tenantId, tenantId),
        eq(tenantDomains.type, "custom"),
        eq(tenantDomains.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Étapes affichées au client : faites, en cours (la première non faite) ou à venir.
 * L'étape « nom de domaine » n'apparaît que si son pack l'inclut.
 */
export function setupSteps(input: {
  setup: { submittedAt: Date | null; reviewRequestedAt: Date | null; approvedAt: Date | null };
  withDomain: boolean;
  domainActive: boolean;
  online: boolean;
}): SetupStep[] {
  const done: Record<SetupStepKey, boolean> = {
    info: Boolean(input.setup.submittedAt),
    building: Boolean(input.setup.reviewRequestedAt),
    review: Boolean(input.setup.approvedAt),
    domain: input.domainActive,
    online: input.online,
  };
  const keys = SETUP_STEPS.filter((key) => key !== "domain" || input.withDomain);
  const current = keys.find((key) => !done[key]);
  return keys.map((key) => ({ key, state: done[key] ? "done" : key === current ? "current" : "todo" }));
}

/** Mise en route terminée : toutes les étapes faites (la liste n'est plus affichée). */
export const setupComplete = (steps: SetupStep[]) => steps.every((step) => step.state === "done");

/**
 * Suivi complet pour l'affichage (espace du client, fiche admin) : questionnaire, étapes, fin.
 * null : pas de suivi pour ce site.
 */
export async function siteSetupView(
  tx: Transaction,
  tenantId: string,
  site: { customDomain: boolean; status: string },
) {
  const setup = await getSiteSetup(tx, tenantId);
  if (!setup) return null;
  const steps = setupSteps({
    setup,
    withDomain: site.customDomain,
    domainActive: site.customDomain && (await hasActiveCustomDomain(tx, tenantId)),
    online: site.status === "active",
  });
  return { setup, steps, complete: setupComplete(steps) };
}
