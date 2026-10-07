"use server";

import { checkLoginCode } from "@/lib/auth/login-code";
import { safeRedirectPath } from "@/lib/auth/providers";

export type LoginCodeOutcome = { url: string } | { error: "codeInvalid" | "codeLocked" };

/**
 * Connexion par le code de l'e-mail : bon code, l'adresse du lien magique
 * correspondant, que le navigateur ouvre (même vérification que le bouton).
 */
export async function verifyLoginCodeAction(
  email: string,
  code: string,
  callbackPath: string,
  errorPath: string,
): Promise<LoginCodeOutcome> {
  const result = await checkLoginCode(String(email).slice(0, 254), String(code).slice(0, 20));
  if (!result.ok) return { error: result.reason === "locked" ? "codeLocked" : "codeInvalid" };
  const callback = safeRedirectPath(callbackPath, "/espace");
  const params = new URLSearchParams({
    token: result.token,
    callbackURL: callback,
    newUserCallbackURL: callback,
    errorCallbackURL: `${safeRedirectPath(errorPath, "/connexion")}?erreur=lien`,
  });
  return { url: `/api/auth/magic-link/verify?${params.toString()}` };
}
