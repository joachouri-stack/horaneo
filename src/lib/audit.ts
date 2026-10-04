import type { Transaction } from "@/db/client";
import { auditLog } from "@/db/schema";

/** Enregistre une action dans le journal de l'administratrice (ajout seul). */
export async function recordAudit(
  tx: Transaction,
  entry: {
    actorUserId: string | null;
    action: string;
    tenantId?: string | null;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ip?: string | null;
  },
) {
  await tx.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    tenantId: entry.tenantId ?? null,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details ?? {},
    ip: entry.ip ?? null,
  });
}
