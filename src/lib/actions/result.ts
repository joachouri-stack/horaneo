import { ZodError } from "zod";
import { AppError, type AppErrorCode } from "@/modules/errors";

/** Résultat d'une action de formulaire : succès, ou erreur avec un code traduisible. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: AppErrorCode; field?: string; fields?: string[] };

/** Transforme une erreur métier ou de validation en résultat ; relance les autres. */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof AppError) return { ok: false, error: error.code, field: error.field };
  if (error instanceof ZodError) {
    const fields = [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "")))].filter(Boolean);
    return { ok: false, error: "invalid", field: fields[0], fields };
  }
  throw error;
}
