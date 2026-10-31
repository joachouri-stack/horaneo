"use server";

import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/translator";
import { getCurrentSession } from "@/lib/auth/session";
import { confirmTwoFactorSetup, getAdminSecurityState, verifyAdminCode } from "@/lib/auth/two-factor-service";
import { createRateLimiter } from "@/lib/rate-limit";

/** 5 essais de code toutes les 5 minutes par compte. */
const codeAttempts = createRateLimiter({ max: 5, windowMs: 5 * 60 * 1000 });

export type CodeFormState = { error?: "invalidCode" | "tooManyAttempts"; backupCodes?: string[] };

async function adminSession() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Non connectée");
  const state = await getAdminSecurityState(session.user.id);
  if (!state.isPlatformAdmin) throw new Error("Accès refusé");
  return session;
}

export async function confirmSetupAction(
  _previous: CodeFormState,
  formData: FormData,
): Promise<CodeFormState> {
  const session = await adminSession();
  if (!codeAttempts.attempt(session.user.id)) return { error: "tooManyAttempts" };
  const codes = await confirmTwoFactorSetup(
    session.user.id,
    session.session.id,
    String(formData.get("code") ?? ""),
  );
  if (!codes) return { error: "invalidCode" };
  codeAttempts.reset(session.user.id);
  return { backupCodes: codes };
}

export async function verifyCodeAction(_previous: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const session = await adminSession();
  if (!codeAttempts.attempt(session.user.id)) return { error: "tooManyAttempts" };
  const ok = await verifyAdminCode(session.user.id, session.session.id, String(formData.get("code") ?? ""));
  if (ok === "locked") return { error: "tooManyAttempts" };
  if (!ok) return { error: "invalidCode" };
  codeAttempts.reset(session.user.id);
  redirect({ href: "/admin", locale: resolveLocale(await getLocale()) });
  return {};
}
