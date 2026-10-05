import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Transaction } from "@/db/client";
import { plans, tenants, updateRequests, users } from "@/db/schema";
import { AppError } from "@/modules/errors";

/**
 * Demandes de mise à jour : la gérante ne modifie pas elle-même logo, couleurs,
 * mise en page et textes de présentation ; elle envoie une demande à l'administratrice.
 */

export const updateRequestInput = z.object({
  subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(3000),
});

export async function createUpdateRequest(
  tx: Transaction,
  tenantId: string,
  userId: string | null,
  raw: z.input<typeof updateRequestInput>,
) {
  const input = updateRequestInput.parse(raw);
  const [created] = await tx
    .insert(updateRequests)
    .values({ tenantId, createdByUserId: userId, ...input })
    .returning();
  return created;
}

export async function listTenantRequests(tx: Transaction, tenantId: string) {
  return tx
    .select()
    .from(updateRequests)
    .where(eq(updateRequests.tenantId, tenantId))
    .orderBy(desc(updateRequests.createdAt))
    .limit(50);
}

// ─── Espace admin ─────────────────────────────────────────────────────────────

export const REQUEST_STATUSES = ["new", "in_progress", "done", "rejected"] as const;

export async function listAllRequests(tx: Transaction, filters: { status?: string; tenantId?: string } = {}) {
  const status = (REQUEST_STATUSES as readonly string[]).includes(filters.status ?? "")
    ? (filters.status as (typeof REQUEST_STATUSES)[number])
    : undefined;
  return tx
    .select({
      id: updateRequests.id,
      subject: updateRequests.subject,
      message: updateRequests.message,
      status: updateRequests.status,
      createdAt: updateRequests.createdAt,
      resolvedAt: updateRequests.resolvedAt,
      tenantId: updateRequests.tenantId,
      tenantName: tenants.name,
      // Pack du client : ce qu'il comprend en mises à jour (une par mois, ou à la demande).
      planName: plans.name,
      planFeatures: plans.features,
      authorEmail: users.email,
    })
    .from(updateRequests)
    .innerJoin(tenants, eq(tenants.id, updateRequests.tenantId))
    .innerJoin(plans, eq(plans.id, tenants.planId))
    .leftJoin(users, eq(users.id, updateRequests.createdByUserId))
    .where(
      and(
        status ? eq(updateRequests.status, status) : inArray(updateRequests.status, ["new", "in_progress"]),
        filters.tenantId ? eq(updateRequests.tenantId, filters.tenantId) : undefined,
      ),
    )
    .orderBy(desc(updateRequests.createdAt))
    .limit(200);
}

export async function setRequestStatus(
  tx: Transaction,
  requestId: string,
  status: (typeof REQUEST_STATUSES)[number],
) {
  const done = status === "done" || status === "rejected";
  const [updated] = await tx
    .update(updateRequests)
    .set({ status, resolvedAt: done ? new Date() : null })
    .where(eq(updateRequests.id, requestId))
    .returning();
  if (!updated) throw new AppError("not_found");
  return updated;
}

/** Nombre de demandes du mois par client (compteur mensuel). */
export async function monthlyRequestCounts(tx: Transaction, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await tx
    .select({ tenantId: updateRequests.tenantId, value: count() })
    .from(updateRequests)
    .where(gte(updateRequests.createdAt, monthStart))
    .groupBy(updateRequests.tenantId);
  return new Map(rows.map((row) => [row.tenantId, row.value]));
}
