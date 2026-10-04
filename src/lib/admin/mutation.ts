import "server-only";
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { ZodError } from "zod";
import { env } from "@/config/env";
import { withPlatform } from "@/db/access";
import type { Transaction } from "@/db/client";
import { recordAudit } from "@/lib/audit";
import { decideAdminAccess } from "@/lib/auth/admin-access";
import { getCurrentSession } from "@/lib/auth/session";
import { getAdminSecurityState } from "@/lib/auth/two-factor-service";
import { AppError, type AppErrorCode } from "@/modules/errors";

/**
 * Exécution sûre d'une action de l'espace admin :
 * 1. revérifie les droits (administratrice + double vérification valide) ;
 * 2. exécute le changement dans une transaction avec le rôle plateforme ;
 * 3. l'inscrit dans le journal, dans la même transaction ;
 * 4. renvoie un résultat simple, avec un code d'erreur traduisible.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: AppErrorCode; field?: string; fields?: string[] };

export type AdminContext = { userId: string; ip: string | null };

export async function requireAdminContext(): Promise<AdminContext> {
  const session = await getCurrentSession();
  if (!session) throw new Error("Non connectée");
  const state = await getAdminSecurityState(session.user.id);
  const access = decideAdminAccess({
    isPlatformAdmin: state.isPlatformAdmin,
    twoFactorConfirmed: state.twoFactorConfirmed,
    sessionVerifiedAt: session.session.twoFactorVerifiedAt
      ? new Date(session.session.twoFactorVerifiedAt)
      : null,
  });
  if (access !== "granted") throw new Error("Accès admin refusé");
  const requestHeaders = await headers();
  // En-tête configuré (CLIENT_IP_HEADERS), le même que pour la limitation des tentatives.
  const header = env().CLIENT_IP_HEADERS.split(",")[0].trim().toLowerCase();
  const ip = requestHeaders.get(header)?.split(",")[0]?.trim() || null;
  return { userId: session.user.id, ip: ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null };
}

type AuditInfo = {
  action: string;
  tenantId?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export async function adminMutation<T>(
  audit: AuditInfo | ((result: T) => AuditInfo),
  fn: (tx: Transaction, context: AdminContext) => Promise<T>,
): Promise<ActionResult<T>> {
  const context = await requireAdminContext();
  try {
    const data = await withPlatform(async (tx) => {
      const result = await fn(tx, context);
      const info = typeof audit === "function" ? audit(result) : audit;
      await recordAudit(tx, { actorUserId: context.userId, ip: context.ip, ...info });
      return result;
    });
    refresh();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.code, field: error.field };
    if (error instanceof ZodError) {
      const fields = [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "")))].filter(Boolean);
      return { ok: false, error: "invalid", field: fields[0], fields };
    }
    throw error;
  }
}

/** Lecture dans l'espace admin (droits revérifiés, rôle plateforme). */
export async function adminQuery<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  await requireAdminContext();
  return withPlatform(fn);
}

/** Petits outils de lecture des formulaires. */
export const form = {
  text: (data: FormData, key: string) => String(data.get(key) ?? ""),
  optional: (data: FormData, key: string) => {
    const value = data.get(key);
    return value === null || String(value).trim() === "" ? undefined : String(value);
  },
  bool: (data: FormData, key: string) => data.get(key) === "on" || data.get(key) === "true",
  all: (data: FormData, key: string) => data.getAll(key).map(String),
  file: async (data: FormData, key: string) => {
    const file = data.get(key);
    if (!(file instanceof File) || file.size === 0) return null;
    return new Uint8Array(await file.arrayBuffer());
  },
};
